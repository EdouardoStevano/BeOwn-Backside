import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { round2 } from 'src/common/platform-fees/platform-fees.constants';
import { formatEur } from 'src/shared/money/format-eur';

/** Ce qu'une compensation a réellement défait — sert au texte des messages. */
export interface ResultatCompensation {
  /** Statut dans lequel l'annonce a été ramenée, `null` si rien à libérer. */
  statutOrdre: OrdreMarcheStatus | null;
  /** Montant effectivement rendu disponible à l'acheteur (0 si rien à rendre). */
  montantLibere: number;
}

/**
 * Réservation des fonds d'une cession et compensation d'une cession qui
 * n'aboutit pas.
 *
 * Deux trous se refermaient l'un l'autre, d'où un service unique :
 *
 *  1. **Fonds jamais réservés** — entre l'acceptation du vendeur et la
 *     signature de l'acheteur (48 h), le solde de l'acheteur restait
 *     entièrement disponible : il pouvait le retirer ou le réinvestir, et le
 *     règlement échouait alors sur un « solde insuffisant » après que le
 *     vendeur se soit engagé. Le montant est désormais déplacé du solde
 *     disponible vers `soldeBloque` DÈS l'acceptation : les fonds détenus par
 *     le wallet ne changent pas (invariant du grand livre respecté), seule leur
 *     disponibilité change.
 *
 *  2. **Annonce coincée en ACCEPTE** — une signature expirée ou annulée
 *     laissait l'ordre en `accepte`, c'est-à-dire hors du carnet, sans
 *     acheteur signataire et sans aucun chemin pour en sortir. L'annonce était
 *     perdue pour son vendeur.
 *
 * Libérer les fonds sans libérer l'annonce (ou l'inverse) laisserait la moitié
 * du problème : les deux gestes sont donc toujours joués ensemble, dans une
 * même transaction.
 */
@Injectable()
export class CessionCompensationService {
  private readonly logger = new Logger(CessionCompensationService.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Montant qu'engage une cession — sert d'assiette à la réservation. */
  static montantCession(prixUnitaire: number | string, nbFractions: number): number {
    return round2(Number(prixUnitaire) * nbFractions);
  }

  /**
   * Bloque le montant de la cession sur le wallet de l'acheteur.
   *
   * Écriture ATOMIQUE ET CONDITIONNELLE (`solde >= :montant`) : deux
   * acceptations concurrentes sur des annonces différentes ne peuvent pas
   * réserver deux fois le même euro — la seconde ne trouve plus le solde et
   * repart en erreur métier, sans jamais laisser un solde négatif.
   */
  async reserverFonds(acheteurId: number, montant: number): Promise<void> {
    if (montant <= 0) return;

    const reservation = await this.walletRepo
      .createQueryBuilder()
      .update(WalletEntity)
      .set({
        solde: () => 'solde - :montant',
        soldeBloque: () => '"soldeBloque" + :montant',
      })
      .setParameter('montant', montant)
      .where(
        '"proprietaireUserId" = :acheteurId AND type = :type AND solde >= :montant',
        { acheteurId, type: WalletType.INVESTISSEUR, montant },
      )
      .execute();

    if (!reservation.affected) {
      throw new BadRequestException(
        `Solde insuffisant pour engager cette cession : ${formatEur(montant)} doivent être disponibles ` +
          "sur votre portefeuille jusqu'à la signature de l'acheteur.",
      );
    }

    this.logger.log(
      `Fonds réservés : ${formatEur(montant)} bloqués pour l'acheteur ${acheteurId}`,
    );
  }

  /**
   * Rend disponibles des fonds réservés. Idempotent par la condition
   * `soldeBloque >= :montant` : un second appel (webhook ET cron de sécurité,
   * par exemple) ne recrédite jamais deux fois.
   */
  async libererFonds(
    acheteurId: number,
    montant: number,
    manager?: EntityManager,
  ): Promise<number> {
    if (montant <= 0) return 0;

    const cible = manager ?? this.dataSource.manager;
    const liberation = await cible
      .createQueryBuilder()
      .update(WalletEntity)
      .set({
        solde: () => 'solde + :montant',
        soldeBloque: () => '"soldeBloque" - :montant',
      })
      .setParameter('montant', montant)
      .where(
        '"proprietaireUserId" = :acheteurId AND type = :type AND "soldeBloque" >= :montant',
        { acheteurId, type: WalletType.INVESTISSEUR, montant },
      )
      .execute();

    if (!liberation.affected) {
      // Rien de bloqué à hauteur du montant : cession antérieure à la
      // réservation, ou libération déjà jouée. On ne force pas — un recrédit
      // inconditionnel créerait de l'argent.
      this.logger.warn(
        `Libération sans effet pour l'acheteur ${acheteurId} (${formatEur(montant)}) : ` +
          'aucun montant bloqué correspondant.',
      );
      return 0;
    }
    return montant;
  }

  /**
   * Ramène une annonce d'`accepte` vers un état où quelqu'un peut encore agir.
   *
   * - la marque d'intérêt est intacte → retour en `interet_exprime` : le
   *   vendeur retrouve son choix d'accepter ou de refuser ;
   * - l'intérêt a été retiré (ou n'a jamais existé) → retour en `en_carnet` :
   *   l'annonce est republiée, purgée de tout acheteur.
   *
   * Transition CONDITIONNELLE sur `accepte` : une annonce déjà exécutée,
   * annulée ou libérée par un autre chemin n'est jamais rétrogradée.
   */
  async libererOrdre(
    ordreId: string,
    manager?: EntityManager,
  ): Promise<OrdreMarcheStatus | null> {
    const cible = manager ?? this.dataSource.manager;
    const ordre = await cible.findOne(OrdreMarcheEntity, { where: { id: ordreId } });
    if (!ordre || ordre.statut !== OrdreMarcheStatus.ACCEPTE) return null;

    const interetIntact = ordre.acheteurId != null && ordre.interetNbFractions != null;
    const cibleStatut = interetIntact
      ? OrdreMarcheStatus.INTERET_EXPRIME
      : OrdreMarcheStatus.EN_CARNET;

    // `accepteLe` est remis à NULL dans les deux branches : l'ordre n'est plus
    // accepté, et une acceptation future reposera son propre horodatage.
    const valeurs = interetIntact
      ? { statut: cibleStatut, accepteLe: null }
      : {
          statut: cibleStatut,
          accepteLe: null,
          acheteurId: null,
          interetNbFractions: null,
          interetExprimeLe: null,
        };

    const transition = await cible
      .createQueryBuilder()
      .update(OrdreMarcheEntity)
      .set(valeurs)
      .where('id = :id AND statut = :accepte', {
        id: ordreId,
        accepte: OrdreMarcheStatus.ACCEPTE,
      })
      .execute();

    return transition.affected ? cibleStatut : null;
  }

  /**
   * Compensation complète d'une cession qui n'aboutira pas : les fonds
   * redeviennent disponibles ET l'annonce redevient actionnable, dans une même
   * transaction — un demi-rattrapage serait pire que pas de rattrapage.
   */
  async compenserCessionInaboutie(params: {
    ordreId: string | null;
    acheteurId: number;
    nbFractions: number | null;
  }): Promise<ResultatCompensation> {
    if (!params.ordreId) return { statutOrdre: null, montantLibere: 0 };

    return this.dataSource.transaction(async (manager) => {
      const ordre = await manager.findOne(OrdreMarcheEntity, {
        where: { id: params.ordreId! },
      });
      if (!ordre) return { statutOrdre: null, montantLibere: 0 };

      const montant = CessionCompensationService.montantCession(
        ordre.prixUnitaire,
        params.nbFractions ?? 0,
      );
      const montantLibere = await this.libererFonds(
        params.acheteurId,
        montant,
        manager,
      );
      const statutOrdre = await this.libererOrdre(params.ordreId!, manager);

      if (statutOrdre) {
        this.logger.log(
          `Cession non aboutie sur l'annonce ${params.ordreId} : statut ramené à ${statutOrdre}, ` +
            `${formatEur(montantLibere)} libérés pour l'acheteur ${params.acheteurId}`,
        );
      }
      return { statutOrdre, montantLibere };
    });
  }
}
