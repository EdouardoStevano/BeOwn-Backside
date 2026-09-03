import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { KIND_VERSEMENT_PORTEUR } from 'src/wallets/applications/project-ledger.service';

export interface TresoreriePorteurInput {
  projetId: string;
  /** Porteur connecté — la propriété du projet est vérifiée contre lui. */
  porteurUserId: number;
  limit?: number;
  offset?: number;
}

export interface LigneVersement {
  id: string;
  /** Date du mouvement, ISO 8601. Pour un virement constaté hors plateforme,
   *  c'est la date RÉELLE du virement déclarée par le back-office. */
  date: string;
  montant: number;
  devise: string;
  statut: TransactionStatus;
  /** Référence bancaire (constat manuel) ou identifiant Stripe (exécution). */
  reference: string | null;
}

export interface LigneApport {
  id: string;
  date: string;
  montant: number;
  statut: TransactionStatus;
}

export interface TresoreriePorteur {
  projetId: string;
  titreProjet: string;
  /** `null` tant qu'aucun mouvement financier n'a jamais atteint le projet. */
  wallet: { solde: number; soldeBloque: number; devise: string } | null;
  versements: LigneVersement[];
  apports: LigneApport[];
  /** Σ des versements CONFIRMÉS (arrivés en banque) — pas des en-vol. */
  totalVerse: number;
  totalApports: number;
}

export const TRESORERIE_LIMIT_DEFAUT = 50;

/**
 * Trésorerie d'un projet, vue PORTEUR.
 *
 * POURQUOI CE CAS D'USAGE — le porteur reçoit de l'argent de la plateforme
 * (versements Stripe et virements constatés) et en apporte (apports par carte),
 * mais n'avait AUCUNE vue sur ces mouvements : il apprenait un versement par
 * son relevé bancaire. Cette lecture lui rend son grand livre, sans rien
 * exposer d'autre que ce qui le concerne.
 *
 * LECTURE SEULE, et strictement scopée : le projet doit appartenir au porteur
 * appelant (anti-IDOR), et seuls les mouvements du wallet TECHNIQUE_PROJET de
 * CE projet sont lus. Aucun wallet n'est créé ici — un projet sans mouvement
 * rend `wallet: null` et des listes vides, jamais une erreur : « pas encore
 * d'argent » est un état normal de la vie d'un projet, pas une panne.
 *
 * IDENTIFICATION DES MOUVEMENTS — mêmes critères que les écritures :
 *  - versement au porteur : `type = RETRAIT` + `walletSource` = wallet projet
 *    + `metadata.kind = 'versement_porteur'`, posés à l'identique par le canal
 *    Stripe (`VerserPorteurUseCase`) et par le constat manuel
 *    (`ProjectLedgerService.declarerVersementPorteur`) ;
 *  - apport : `type = APPORT_PORTEUR` + `walletDestination` = wallet projet
 *    (`CrediterApportPorteurUseCase`).
 *
 * TOTAUX — calculés en SQL sur TOUTES les écritures (pas la page affichée), et
 * sur les seuls statuts REUSSI : `totalVerse` signifie « arrivé en banque »,
 * même sémantique que le `dejaVerse` du grand livre back-office. Un versement
 * EN_COURS apparaît dans la liste avec son badge, mais ne gonfle pas le total.
 */
@Injectable()
export class GetPorteurTresorerieUseCase {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async execute(input: TresoreriePorteurInput): Promise<TresoreriePorteur> {
    const limit = input.limit ?? TRESORERIE_LIMIT_DEFAUT;
    const offset = input.offset ?? 0;

    // Anti-IDOR : l'appartenance est tranchée AVANT toute lecture financière.
    const projet = await this.projectRepo.findOne({
      where: { id: input.projetId },
    });
    if (!projet) throw new NotFoundException('Projet introuvable.');
    if (projet.porteurId !== input.porteurUserId) {
      throw new ForbiddenException(
        "Ce projet n'est pas rattaché à votre compte porteur.",
      );
    }

    // Lecture SANS création : résoudre-en-créant appartient aux écritures.
    const wallet = await this.walletRepo.findOne({
      where: { projetId: input.projetId, type: WalletType.TECHNIQUE_PROJET },
    });
    if (!wallet) {
      return {
        projetId: projet.id,
        titreProjet: projet.titre,
        wallet: null,
        versements: [],
        apports: [],
        totalVerse: 0,
        totalApports: 0,
      };
    }

    // Les quatre requêtes sont indépendantes : construites séquentiellement
    // (ordre déterministe, y compris sous test), exécutées en parallèle.
    const qbVersements = this.qbVersements(wallet.id)
      .orderBy('t.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    const qbTotalVerse = this.qbVersements(wallet.id)
      .select('COALESCE(SUM(t.montant), 0)', 'total')
      .andWhere('t.statut = :statut', { statut: TransactionStatus.REUSSI });
    const qbApports = this.qbApports(wallet.id)
      .orderBy('t.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    const qbTotalApports = this.qbApports(wallet.id)
      .select('COALESCE(SUM(t.montant), 0)', 'total')
      .andWhere('t.statut = :statut', { statut: TransactionStatus.REUSSI });

    const [versements, totalVerse, apports, totalApports] = await Promise.all([
      qbVersements.getMany(),
      qbTotalVerse.getRawOne<{ total: string }>(),
      qbApports.getMany(),
      qbTotalApports.getRawOne<{ total: string }>(),
    ]);

    return {
      projetId: projet.id,
      titreProjet: projet.titre,
      wallet: {
        solde: Number(wallet.solde),
        soldeBloque: Number(wallet.soldeBloque),
        devise: wallet.devise ?? 'EUR',
      },
      versements: versements.map((tx) => this.mapVersement(tx)),
      apports: apports.map((tx) => this.mapApport(tx)),
      totalVerse: Number(totalVerse?.total ?? 0),
      totalApports: Number(totalApports?.total ?? 0),
    };
  }

  /** Versements du wallet projet vers le porteur — les deux canaux confondus. */
  private qbVersements(walletId: string) {
    return this.txRepo
      .createQueryBuilder('t')
      .where('t.walletSource = :walletId', { walletId })
      .andWhere('t.type = :type', { type: TransactionType.RETRAIT })
      .andWhere(`t.metadata ->> 'kind' = :kind`, {
        kind: KIND_VERSEMENT_PORTEUR,
      });
  }

  /** Apports du porteur (carte) vers le wallet projet. */
  private qbApports(walletId: string) {
    return this.txRepo
      .createQueryBuilder('t')
      .where('t.walletDestination = :walletId', { walletId })
      .andWhere('t.type = :type', { type: TransactionType.APPORT_PORTEUR });
  }

  private mapVersement(tx: TransactionEntity): LigneVersement {
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    // Un constat manuel porte la date RÉELLE du virement dans ses metadata
    // (possiblement antérieure à l'enregistrement) : c'est elle qui fait foi.
    const dateVersement =
      typeof meta.dateVersement === 'string' ? meta.dateVersement : null;
    return {
      id: tx.id,
      date: dateVersement ?? tx.createdAt.toISOString(),
      montant: Number(tx.montant),
      devise: tx.devise ?? 'EUR',
      statut: tx.statut,
      // Constat manuel → référence bancaire ; canal Stripe → id du transfert.
      reference: tx.referenceExterne ?? tx.fournisseurRef ?? null,
    };
  }

  private mapApport(tx: TransactionEntity): LigneApport {
    return {
      id: tx.id,
      date: tx.createdAt.toISOString(),
      montant: Number(tx.montant),
      statut: tx.statut,
    };
  }
}
