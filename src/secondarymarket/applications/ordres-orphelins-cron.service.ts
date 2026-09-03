import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { CessionCompensationService } from './cession-compensation.service';

/**
 * Délai de grâce après le passage en ACCEPTE avant qu'un ordre sans signature
 * soit considéré comme orphelin. Le parcours de signature s'ouvre dans les
 * secondes qui suivent l'acceptation (réservation des fonds + génération du
 * contrat + prestataire) : une heure couvre très largement ce vol, tout en
 * libérant l'annonce et les fonds bien avant que quiconque ne s'en plaigne.
 */
export const DELAI_GRACE_ACCEPTATION_MS = 60 * 60 * 1000;

/** Nombre d'ordres examinés par passage — borne la charge d'un balayage. */
const TAILLE_LOT = 200;

/**
 * Filet de sécurité : libération des ordres ACCEPTE sans signature vivante.
 *
 * LE TROU QUE CE BALAYAGE REFERME — l'acceptation d'une marque d'intérêt
 * enchaîne trois gestes NON transactionnels (claim `ACCEPTE`, réservation des
 * fonds, ouverture de la signature) et compense en sens inverse si l'un
 * échoue. Mais une mort du processus au milieu de la séquence ne compense
 * rien : l'ordre reste `accepte` SANS AUCUNE signature à expirer — le cron
 * d'expiration des signatures (`SignaturesExpiryCronService`) ne le verra
 * jamais, puisqu'il balaie des lignes de signature. L'annonce est alors perdue
 * pour son vendeur et les fonds éventuellement réservés le restent à vie.
 * Même impasse si la compensation d'une signature expirée/annulée a échoué
 * après la transition de la signature : plus rien ne la rejouera.
 *
 * CE QU'IL FAIT — pour chaque ordre `accepte` hors délai de grâce dont AUCUNE
 * signature n'est vivante (ni PENDING — en attente, ni SIGNED — cession en
 * cours d'exécution), il rejoue la MÊME compensation que le webhook et le cron
 * d'expiration (`CessionCompensationService.compenserCessionInaboutie`) :
 * fonds libérés ET annonce rendue actionnable, dans une même transaction,
 * idempotente par ses écritures conditionnelles.
 *
 * POURQUOI LE DÉLAI DE GRÂCE — sans lui, un balayage tombant entre le claim
 * `ACCEPTE` et la création de la signature compenserait une cession en train
 * de naître. `accepteLe` est posé par le claim lui-même ; un ordre encore dans
 * l'heure est laissé tranquille. Un `accepteLe` NULL (lignes antérieures à la
 * colonne) est traité comme hors délai : ces ordres-là sont coincés depuis
 * bien plus d'une heure.
 */
@Injectable()
export class OrdresOrphelinsCronService {
  private readonly logger = new Logger(OrdresOrphelinsCronService.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    private readonly compensation: CessionCompensationService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async libererOrdresOrphelins(maintenant: Date = new Date()): Promise<number> {
    const limiteGrace = new Date(maintenant.getTime() - DELAI_GRACE_ACCEPTATION_MS);

    const candidats = await this.ordreRepo.find({
      where: [
        { statut: OrdreMarcheStatus.ACCEPTE, accepteLe: LessThanOrEqual(limiteGrace) },
        { statut: OrdreMarcheStatus.ACCEPTE, accepteLe: IsNull() },
      ],
      take: TAILLE_LOT,
    });
    if (candidats.length === 0) {
      this.logger.debug('CRON ordres-orphelins : aucun ordre accepté hors délai.');
      return 0;
    }

    // Signatures chargées EN LOT (pas de N+1) : un ordre n'est orphelin que si
    // aucune de ses signatures n'est vivante.
    const signatures = await this.signatureRepo.find({
      where: { ordreId: In(candidats.map((o) => o.id)) },
    });
    const ordresAvecSignatureVivante = new Set(
      signatures
        .filter(
          (s) =>
            s.statut === SignatureStatus.PENDING ||
            s.statut === SignatureStatus.SIGNED,
        )
        .map((s) => s.ordreId),
    );

    let liberes = 0;
    for (const ordre of candidats) {
      if (ordresAvecSignatureVivante.has(ordre.id)) continue;
      try {
        if (await this.libererUnOrdre(ordre)) liberes += 1;
      } catch (err: any) {
        // Un ordre en échec ne doit pas bloquer la libération des autres.
        this.logger.error(
          `CRON ordres-orphelins : échec sur l'ordre ${ordre.id} : ${err?.message}`,
        );
      }
    }

    this.logger.log(
      `CRON ordres-orphelins : ${liberes}/${candidats.length} ordre(s) accepté(s) ` +
        'sans signature vivante libéré(s).',
    );
    return liberes;
  }

  private async libererUnOrdre(ordre: OrdreMarcheEntity): Promise<boolean> {
    const { statutOrdre, montantLibere } =
      await this.compensation.compenserCessionInaboutie({
        ordreId: ordre.id,
        // Un ordre accepté sans acheteur identifiable n'a rien à rendre côté
        // fonds (montant nul → libération sans effet) : seule l'annonce est
        // rendue au carnet.
        acheteurId: ordre.acheteurId ?? 0,
        nbFractions: ordre.interetNbFractions,
      });
    if (!statutOrdre) return false;

    this.logger.warn(
      `Ordre ${ordre.id} accepté sans signature vivante : statut ramené à ${statutOrdre}, ` +
        `${montantLibere} EUR libérés pour l'acheteur ${ordre.acheteurId ?? 'inconnu'}.`,
    );

    await this.notifications
      .push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Votre annonce est de nouveau actionnable',
        message:
          statutOrdre === OrdreMarcheStatus.EN_CARNET
            ? "La cession engagée sur votre annonce n'a pas pu aboutir : elle est republiée " +
              "sur le tableau d'affichage."
            : "La cession engagée sur votre annonce n'a pas pu aboutir : la marque d'intérêt " +
              "vous est de nouveau soumise, vous pouvez l'accepter à nouveau ou la refuser.",
        metadata: { ordreId: ordre.id, statut: statutOrdre },
      })
      .catch(() => {});

    if (montantLibere > 0 && ordre.acheteurId != null) {
      await this.notifications
        .push({
          utilisateurId: ordre.acheteurId,
          type: NotificationType.MARCHE_SECONDAIRE,
          titre: 'Fonds de nouveau disponibles',
          message:
            "La cession que vous aviez engagée n'a pas pu aboutir : les fonds réservés " +
            'sont de nouveau disponibles sur votre portefeuille.',
          metadata: { ordreId: ordre.id },
        })
        .catch(() => {});
    }
    return true;
  }
}
