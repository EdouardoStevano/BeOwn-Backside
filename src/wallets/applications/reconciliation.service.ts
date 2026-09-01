import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from '../infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from '../infrastructure/persistences/entities/transaction.entity';
import {
  STATUTS_MOUVEMENT_APPLIQUE,
  WalletType,
} from '../domains/enums/wallet.enum';
import {
  EcartRapprochement,
  EcritureGrandLivre,
  PositionWallet,
  TOLERANCE_INVARIANT_EUR,
  fondsDetenus,
  rapprocherGrandLivre,
} from '../domains/grand-livre';
import { PlateformeBalanceReader } from './ports/plateforme-balance.port';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { formatEur } from 'src/shared/money/format-eur';

/**
 * Taille d'un lot de lecture du grand livre.
 *
 * Le registre est la table la plus volumineuse de la plateforme et il n'est
 * PAS filtré ici (le rapprochement porte sur l'intégralité de l'historique).
 * Un `find()` nu ferait hydrater d'un seul coup autant d'entités TypeORM qu'il
 * y a d'écritures : c'est le chemin le plus court vers un OOM du pod, et le
 * pire moment pour l'apprendre est 5h30 du matin.
 *
 * Le découpage borne ce que l'ORM et le driver manipulent SIMULTANÉMENT : à
 * chaque tour, seules 5 000 lignes sont hydratées, converties en objets
 * minimaux (trois champs) puis relâchées. Le cumul des objets minimaux reste
 * en mémoire — la fonction de rapprochement du domaine est pure et travaille
 * sur l'ensemble des écritures — mais il pèse une fraction de l'entité
 * complète (jsonb `metadata`, dates, références PSP…) qui, elle, n'est jamais
 * conservée.
 */
const TAILLE_LOT_ECRITURES = 5_000;

/** Nombre d'écarts détaillés retenus dans les journaux et l'alerte. */
const MAX_ECARTS_JOURNALISES = 20;

/** Étiquette du job portée par la jauge de fraîcheur de réconciliation. */
const JOB_RECONCILIATION = 'grand-livre';

export interface RapportReconciliation {
  /** Horodatage ISO de l'exécution. */
  executeLe: string;
  nbWallets: number;
  nbEcritures: number;
  /** Un écart par portefeuille hors tolérance ; vide = grand livre rapproché. */
  ecarts: EcartRapprochement[];
  /** Somme des |écart| des portefeuilles hors tolérance. */
  ecartLedgerTotalEur: number;
  /** Σ (solde + soldeBloque) des portefeuilles investisseurs. */
  soldeInvestisseursEur: number;
  /** Solde du compte plateforme chez le PSP ; `null` si celui-ci est injoignable. */
  soldeStripeEur: number | null;
  /** `soldeStripe − soldeInvestisseurs` ; `null` si le PSP est injoignable. */
  ecartStripeEur: number | null;
  /** Vrai seulement si les DEUX contrôles ont pu être menés et sont au vert. */
  equilibre: boolean;
}

/**
 * Réconciliation financière quotidienne.
 *
 * Deux contrôles indépendants, dans cet ordre de gravité décroissante :
 *
 *  1. GRAND LIVRE INTERNE — pour chaque portefeuille, `solde + soldeBloque`
 *     doit égaler « Σ crédits − Σ débits » reconstitué depuis les écritures.
 *     Un écart signale une écriture manquante ou inscrite du mauvais côté :
 *     l'argent affiché aux investisseurs ne correspond plus à son historique.
 *
 *  2. COUVERTURE PSP — le solde détenu chez le prestataire doit couvrir la
 *     somme des portefeuilles investisseurs. Un écart négatif signifie que la
 *     plateforme doit à ses clients plus qu'elle ne détient réellement.
 *
 * La règle de rapprochement elle-même n'est PAS ici : elle vit dans
 * `domains/grand-livre.ts` sous forme de fonctions pures, testées isolément.
 * Ce service ne fait que collecter les données, appeler ces fonctions, émettre
 * les métriques et alerter. Aucun fonds n'est déplacé : la réconciliation
 * CONSTATE, elle ne corrige jamais d'elle-même — une correction automatique
 * sur une base dont on vient de prouver l'incohérence serait le pire des
 * remèdes.
 *
 * RGPD : ni identifiant utilisateur, ni e-mail, ni IBAN dans les journaux, les
 * métriques ou l'alerte. Seuls des identifiants de PORTEFEUILLE et des
 * montants circulent — suffisant pour investiguer, insuffisant pour
 * réidentifier une personne sans accès à la base.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly plateformeBalance: PlateformeBalanceReader,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsPort,
  ) {}

  /** Exécute la réconciliation complète et rend son rapport. */
  async reconcilier(): Promise<RapportReconciliation> {
    const executeLe = new Date().toISOString();

    // 1. Positions réelles de TOUS les portefeuilles. Le rapprochement n'a de
    //    sens qu'exhaustif : restreindre le périmètre laisserait fuir
    //    exactement les portefeuilles qu'on ne surveille pas.
    const wallets = await this.walletRepo.find();
    const positions = new Map<string, PositionWallet>(
      wallets.map((w) => [w.id, { solde: w.solde, soldeBloque: w.soldeBloque }]),
    );

    // 2. Écritures dont le mouvement a DÉJÀ été appliqué aux soldes — pas
    //    seulement les réussies. Un retrait en vol a débité son portefeuille
    //    dès la demande : l'omettre fabriquait un écart négatif, donc une
    //    fausse alerte, sur chaque portefeuille ayant un retrait en cours
    //    (cf. STATUTS_MOUVEMENT_APPLIQUE). Une transaction initiée, échouée ou
    //    expirée, elle, n'a rien déplacé et ne pèse toujours rien.
    const ecritures = await this.chargerEcrituresMouvementees();

    // 3. Règle métier PURE (domaine) — aucun accès base, aucun réseau.
    const ecarts = rapprocherGrandLivre(positions, ecritures);
    const ecartLedgerTotalEur = ecarts.reduce(
      (total, e) => total + Math.abs(e.ecart),
      0,
    );

    // 4. Engagement de la plateforme envers ses clients : ce que les
    //    investisseurs peuvent réclamer, disponible et bloqué confondus (le
    //    délai de réflexion n'éteint pas la créance, il la gèle).
    const soldeInvestisseursEur = wallets
      .filter((w) => w.type === WalletType.INVESTISSEUR)
      .reduce((total, w) => total + fondsDetenus(w), 0);

    // 5. Volet PSP — isolé dans son propre try/catch : une panne Stripe ne doit
    //    PAS emporter le contrôle du grand livre interne, qui se suffit à
    //    lui-même et reste le plus critique des deux.
    const soldeStripeEur = await this.lireSoldePlateforme();
    const ecartStripeEur =
      soldeStripeEur === null ? null : soldeStripeEur - soldeInvestisseursEur;

    // Un contrôle qui n'a pas pu être mené n'est pas un contrôle réussi : PSP
    // injoignable ⇒ l'invariant de couverture n'est pas PROUVÉ, donc pas
    // d'« équilibre » annoncé. Mieux vaut une alerte explicitement libellée
    // « solde PSP indisponible » qu'un feu vert sur une vérification qui n'a
    // jamais eu lieu.
    const equilibre =
      ecarts.length === 0 &&
      ecartStripeEur !== null &&
      Math.abs(ecartStripeEur) <= TOLERANCE_INVARIANT_EUR;

    const rapport: RapportReconciliation = {
      executeLe,
      nbWallets: wallets.length,
      nbEcritures: ecritures.length,
      ecarts,
      ecartLedgerTotalEur,
      soldeInvestisseursEur,
      soldeStripeEur,
      ecartStripeEur,
      equilibre,
    };

    this.emettreMetriques(rapport);

    if (equilibre) {
      this.logger.log(
        `Réconciliation OK — ${rapport.nbWallets} portefeuilles, ` +
          `${rapport.nbEcritures} écritures, aucun écart ; ` +
          `investisseurs ${formatEur(soldeInvestisseursEur)} / PSP ${formatEur(soldeStripeEur ?? 0)}.`,
      );
    } else {
      this.alerter(rapport);
    }

    // Jauge de FRAÎCHEUR du job (et non de son verdict) : elle atteste que la
    // réconciliation a tourné jusqu'au bout. C'est elle qui déclenche l'alerte
    // « la réconciliation ne tourne plus » — un job muet est plus dangereux
    // qu'un job qui remonte un écart, parce que personne ne le remarque.
    this.metrics.setGauge(
      METRIC.RECONCILIATION_LAST_SUCCESS_TIMESTAMP,
      Math.floor(Date.now() / 1000),
      { job: JOB_RECONCILIATION },
    );

    return rapport;
  }

  /**
   * Grand livre complet, lu par lots et projeté sur le strict nécessaire.
   *
   * Seules trois colonnes sont demandées à la base (plus la clé primaire, qui
   * porte l'ordre de pagination) : le rapprochement n'a besoin que du couple
   * source/destination et du montant. Ne pas ramener `metadata` (jsonb) ni les
   * références PSP divise le volume transféré par un ordre de grandeur — et
   * écarte au passage toute donnée personnelle du chemin de réconciliation.
   */
  private async chargerEcrituresMouvementees(): Promise<EcritureGrandLivre[]> {
    const ecritures: EcritureGrandLivre[] = [];

    for (let offset = 0; ; offset += TAILLE_LOT_ECRITURES) {
      const lot = await this.txRepo
        .createQueryBuilder('t')
        .select([
          't.id',
          't.walletSource',
          't.walletDestination',
          't.montant',
        ])
        .where('t.statut IN (:...statuts)', {
          statuts: STATUTS_MOUVEMENT_APPLIQUE,
        })
        // Ordre stable et indexé (clé primaire) : sans lui, deux pages
        // successives pourraient rejouer ou omettre des lignes.
        .orderBy('t.id', 'ASC')
        .offset(offset)
        .limit(TAILLE_LOT_ECRITURES)
        .getMany();

      if (lot.length === 0) break;

      for (const ligne of lot) {
        ecritures.push({
          walletSource: ligne.walletSource,
          walletDestination: ligne.walletDestination,
          montant: ligne.montant,
        });
      }

      // Page incomplète = fin du registre : inutile d'aller chercher une page
      // vide de confirmation.
      if (lot.length < TAILLE_LOT_ECRITURES) break;
    }

    return ecritures;
  }

  /**
   * Solde du compte plateforme, ou `null` si le prestataire est injoignable.
   *
   * L'indisponibilité est journalisée en `warn` et non en `error` : elle ne
   * traduit aucune anomalie comptable, seulement un contrôle qu'on n'a pas pu
   * mener. C'est le rapport, lui, qui portera l'alerte.
   */
  private async lireSoldePlateforme(): Promise<number | null> {
    try {
      const solde = await this.plateformeBalance.lireSolde();
      return solde.totalEur;
    } catch (err: any) {
      this.logger.warn(
        `Solde du prestataire de paiement indisponible — volet PSP de la ` +
          `réconciliation non vérifié : ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /** Jauges d'intégrité, lues par les règles d'alerte Prometheus. */
  private emettreMetriques(rapport: RapportReconciliation): void {
    this.metrics.setGauge(
      METRIC.WALLET_LEDGER_DISCREPANCY_EUR,
      rapport.ecartLedgerTotalEur,
    );
    if (rapport.ecartStripeEur !== null) {
      // Valeur ABSOLUE : le sens de l'écart se lit dans le rapport et les
      // journaux ; l'alerte, elle, ne doit se déclencher que sur l'ampleur.
      this.metrics.setGauge(
        METRIC.STRIPE_BALANCE_DISCREPANCY_EUR,
        Math.abs(rapport.ecartStripeEur),
      );
    }
  }

  /**
   * Journal structuré + notification aux équipes habilitées.
   *
   * Un SEUL `logger.error` porteur d'un objet JSON : les journaux sont
   * agrégés, et une anomalie éclatée sur vingt lignes est une anomalie qu'on
   * ne retrouve pas. Le détail est borné à
   * {@link MAX_ECARTS_JOURNALISES} portefeuilles — au-delà, ce n'est plus un
   * incident ponctuel mais une corruption systémique, et le nombre total
   * suffit à l'établir.
   */
  private alerter(rapport: RapportReconciliation): void {
    const detail = rapport.ecarts.slice(0, MAX_ECARTS_JOURNALISES);

    this.logger.error(
      JSON.stringify({
        evenement: 'reconciliation.ecart',
        executeLe: rapport.executeLe,
        nbWallets: rapport.nbWallets,
        nbEcritures: rapport.nbEcritures,
        ecartLedgerTotalEur: rapport.ecartLedgerTotalEur,
        ecartStripeEur: rapport.ecartStripeEur,
        soldePspIndisponible: rapport.soldeStripeEur === null,
        nbEcartsPortefeuilles: rapport.ecarts.length,
        ecartsTronquesA: MAX_ECARTS_JOURNALISES,
        // Identifiants de PORTEFEUILLE et montants uniquement — aucun
        // identifiant de personne, aucun e-mail (RGPD).
        ecarts: detail,
      }),
    );

    void this.notifications
      .pushToAdmins({
        type: NotificationType.SECURITE,
        // Le titre distingue un ÉCART CONSTATÉ d'un CONTRÔLE EMPÊCHÉ. Les deux
        // méritent une alerte — un contrôle qui n'a pas pu être mené n'est pas
        // un contrôle réussi — mais les confondre sous « écart détecté »
        // enverrait quotidiennement une fausse alarme dès que le prestataire
        // est injoignable, et c'est ainsi qu'on cesse de lire les alertes.
        titre:
          rapport.ecarts.length === 0 && rapport.soldeStripeEur === null
            ? 'Réconciliation financière : contrôle incomplet'
            : 'Réconciliation financière : écart détecté',
        message: this.messageAlerte(rapport),
        roles: [UserRole.FINANCIER, UserRole.SUPER_ADMIN],
        metadata: {
          executeLe: rapport.executeLe,
          nbWallets: rapport.nbWallets,
          nbEcritures: rapport.nbEcritures,
          nbEcartsPortefeuilles: rapport.ecarts.length,
          ecartLedgerTotalEur: rapport.ecartLedgerTotalEur,
          soldeInvestisseursEur: rapport.soldeInvestisseursEur,
          soldeStripeEur: rapport.soldeStripeEur,
          ecartStripeEur: rapport.ecartStripeEur,
          soldePspIndisponible: rapport.soldeStripeEur === null,
          ecarts: detail,
        },
      })
      // La notification est un CONFORT : son échec ne doit ni faire tomber le
      // cron, ni masquer l'écart déjà inscrit dans les journaux et les jauges.
      .catch(() => {});
  }

  /** Message lisible par l'équipe finance : ce qui cloche, et de combien. */
  private messageAlerte(rapport: RapportReconciliation): string {
    const morceaux: string[] = [];

    if (rapport.ecarts.length > 0) {
      morceaux.push(
        `${rapport.ecarts.length} portefeuille(s) ne se rapprochent pas de leur ` +
          `registre, pour un écart cumulé de ${formatEur(rapport.ecartLedgerTotalEur)}.`,
      );
    } else {
      morceaux.push('Grand livre interne rapproché (aucun écart portefeuille).');
    }

    if (rapport.soldeStripeEur === null) {
      morceaux.push(
        'Solde du prestataire de paiement INDISPONIBLE : la couverture des ' +
          'portefeuilles investisseurs n’a pas pu être vérifiée.',
      );
    } else if (
      rapport.ecartStripeEur !== null &&
      Math.abs(rapport.ecartStripeEur) > TOLERANCE_INVARIANT_EUR
    ) {
      morceaux.push(
        `Couverture PSP : ${formatEur(rapport.soldeStripeEur)} détenus pour ` +
          `${formatEur(rapport.soldeInvestisseursEur)} dus aux investisseurs, ` +
          `soit un écart de ${formatEur(rapport.ecartStripeEur)}.`,
      );
    }

    morceaux.push(
      `Contrôle du ${rapport.executeLe} sur ${rapport.nbWallets} portefeuilles ` +
        `et ${rapport.nbEcritures} écritures. Aucune correction automatique n’a ` +
        'été appliquée.',
    );

    return morceaux.join(' ');
  }
}
