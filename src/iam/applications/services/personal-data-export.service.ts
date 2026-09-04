import { Injectable } from '@nestjs/common';
import { DataSource, In, MoreThan, type FindOptionsWhere } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pm.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { DistributionPartEntity } from 'src/distributions/infrastructure/persistences/entities/distribution-part.entity';
import { ReclamationEntity } from 'src/reclamations/infrastructure/persistences/entities/reclamation.entity';
import { ParrainageAttributionEntity } from 'src/parrainage/infrastructure/persistences/entities/parrainage-attribution.entity';
import { DemandeAccesPorteurEntity } from 'src/porteur-access/infrastructure/persistences/entities/demande-acces-porteur.entity';
import { LIBELLES_MOTIF_REFUS } from 'src/porteur-access/domains/motif-refus';

/**
 * Taille des pages internes : chaque table est lue par lots bornés (keyset sur
 * la clé primaire, jamais d'OFFSET) — la mémoire porte AU PLUS une page par
 * table, quel que soit l'historique du compte.
 */
const TAILLE_PAGE = 500;

/** Forme du fichier remis à l'utilisateur — contrat de l'endpoint art. 15/20. */
export interface ExportDonneesPersonnelles {
  meta: {
    exporteLe: string;
    cadre: string;
    utilisateurId: number;
  };
  identite: Record<string, unknown> | null;
  profil: {
    personnePhysique: Record<string, unknown> | null;
    personneMorale: Record<string, unknown> | null;
  };
  kyc: Record<string, unknown> | null;
  documents: Record<string, unknown>[];
  portefeuille: {
    wallets: Record<string, unknown>[];
    transactions: Record<string, unknown>[];
  };
  investissements: Record<string, unknown>[];
  marcheSecondaire: Record<string, unknown>[];
  distributionsPercues: Record<string, unknown>[];
  preferences: Record<string, unknown> | null;
  reclamations: Record<string, unknown>[];
  parrainage: Record<string, unknown>;
  /** Demandes d'accès porteur déposées par la personne (lot 4). */
  demandesAccesPorteur: Record<string, unknown>[];
}

/**
 * Export des données personnelles de l'utilisateur COURANT (art. 15 — droit
 * d'accès ; art. 20 — portabilité, d'où le JSON structuré lisible machine).
 *
 * ## Anti-IDOR — invariant de TOUTE requête de ce service
 * Chaque lecture est filtrée par le `userId` reçu en paramètre, qui provient
 * EXCLUSIVEMENT du JWT de la requête (posé par le contrôleur depuis
 * `@CurrentUser()`). Aucun identifiant de ressource ne vient du client. Les
 * données de TIERS atteignables par jointure (contrepartie d'un ordre du
 * marché secondaire, filleul/parrain d'une attribution, agent traitant une
 * réclamation) sont MASQUÉES : seul le rôle de l'utilisateur dans la relation
 * est restitué, jamais l'identifiant de l'autre partie.
 *
 * ## Ce qui est volontairement EXCLU de l'export (et pourquoi)
 * - binaires des pièces (KYC, contrats) : l'export liste les MÉTADONNÉES et
 *   références ; les fichiers restent consultables dans l'application ;
 * - `pepFlagged` / `pepNote` / `kyc.scoreRisque` : évaluations internes
 *   LCB-FT — leur divulgation est proscrite (interdiction de divulgation,
 *   art. L. 561-18 s. CMF : ne pas « prévenir » la personne concernée) ;
 * - chemins de stockage internes (`document.path`, `filename`) et clés
 *   techniques (`idempotencyKey`, `metadata` PSP) : données d'infrastructure,
 *   pas des données personnelles de l'utilisateur.
 *
 * ## Placement
 * Service applicatif qui lit les entités de plusieurs contextes via le
 * `DataSource` (même entorse assumée que les exports CSV admin,
 * `admin-exports.controller.ts`) : c'est une PROJECTION en lecture seule
 * transverse par nature — passer par les ports de neuf modules imposerait à
 * IAM d'importer leurs modules entiers pour recopier des lignes. Sanctionné
 * par le plan de lot (`.claude/plans/lot2-rgpd-signature.md`, mission 2).
 * Aucune écriture, aucune règle métier : uniquement des SELECT filtrés.
 */
@Injectable()
export class PersonalDataExportService {
  constructor(private readonly dataSource: DataSource) {}

  async export(userId: number): Promise<ExportDonneesPersonnelles> {
    const [
      identite,
      personnePhysique,
      personneMorale,
      kyc,
      documents,
      wallets,
      investissements,
      ordres,
      preferences,
      reclamations,
      parrainage,
      demandesAccesPorteur,
    ] = await Promise.all([
      this.identite(userId),
      this.profilPP(userId),
      this.profilPM(userId),
      this.kyc(userId),
      this.documents(userId),
      this.wallets(userId),
      this.investissements(userId),
      this.ordresMarche(userId),
      this.preferences(userId),
      this.reclamations(userId),
      this.parrainage(userId),
      this.demandesAccesPorteur(userId),
    ]);

    // Les transactions se filtrent par les wallets du compte, les
    // distributions par ses investissements : ces deux lectures dépendent des
    // identifiants déjà chargés — et restent donc, par construction, bornées
    // aux ressources de l'utilisateur courant.
    const walletIds = wallets.map((w) => w.id as string);
    const investissementIds = investissements.map((i) => i.id as string);
    const [transactions, distributionsPercues] = await Promise.all([
      this.transactions(walletIds),
      this.distributions(investissementIds),
    ]);

    return {
      meta: {
        exporteLe: new Date().toISOString(),
        cadre:
          'Export des données personnelles — articles 15 (accès) et 20 (portabilité) du RGPD',
        utilisateurId: userId,
      },
      identite,
      profil: { personnePhysique, personneMorale },
      kyc,
      documents,
      portefeuille: { wallets, transactions },
      investissements,
      marcheSecondaire: ordres,
      distributionsPercues,
      preferences,
      reclamations,
      parrainage,
      demandesAccesPorteur,
    };
  }

  // ── Lectures par module — chacune filtrée par le userId du JWT ────────────

  private async identite(
    userId: number,
  ): Promise<Record<string, unknown> | null> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { userId } });
    if (!user) return null;

    // Recopie champ à champ (jamais d'étalement de la ligne entière) : un
    // champ ajouté demain à l'entité n'entre dans l'export que si quelqu'un
    // le décide ici. `password` est déjà hors de portée (select: false) ;
    // `pepFlagged`/`pepNote` et `cgpId` (identifiant d'un tiers) sont exclus
    // — voir l'en-tête de classe.
    return {
      utilisateurId: user.userId,
      prenom: user.firstname,
      nom: user.lastname,
      email: user.userEmail?.email ?? null,
      emailVerifie: user.userEmail?.isVerified ?? false,
      emailVerifieLe: user.userEmail?.verifiedDate ?? null,
      identifiantOAuth: user.socialId,
      role: user.role,
      statutCompte: user.status,
      typeCompte: user.userType,
      regimeFiscal: user.regimeFiscal,
      tauxBaremeMarginal: user.tauxBaremeMarginal,
      compteStripeConnect: user.stripeConnectAccountId,
      derniereConnexionLe: user.lastLoginAt,
      compteCreeLe: user.createdAt,
      compteModifieLe: user.updatedAt,
      consentements: {
        cguAccepteesLe: user.cguAccepteesLe,
        cguVersionAcceptee: user.cguVersionAcceptee,
        cguAcceptationIp: user.cguAcceptationIp,
      },
    };
  }

  private async profilPP(
    userId: number,
  ): Promise<Record<string, unknown> | null> {
    const profil = await this.dataSource
      .getRepository(ProfilPPEntity)
      .findOne({ where: { utilisateurId: userId } });
    if (!profil) return null;

    // Le suivi commercial interne (`dernierContactAdmin`, `prochainContactDu`)
    // et la relation ORM restent dehors ; tout le reste est LEUR donnée.
    const {
      utilisateur: _utilisateur,
      dernierContactAdmin: _dca,
      prochainContactDu: _pcd,
      ...donnees
    } = profil as ProfilPPEntity & { utilisateur?: unknown };
    return donnees as Record<string, unknown>;
  }

  private async profilPM(
    userId: number,
  ): Promise<Record<string, unknown> | null> {
    const profil = await this.dataSource
      .getRepository(ProfilPMEntity)
      .findOne({ where: { utilisateurId: userId } });
    if (!profil) return null;

    const { utilisateur: _utilisateur, ...donnees } =
      profil as ProfilPMEntity & { utilisateur?: unknown };
    return donnees as Record<string, unknown>;
  }

  private async kyc(userId: number): Promise<Record<string, unknown> | null> {
    const kyc = await this.dataSource
      .getRepository(KycEntity)
      .findOne({ where: { utilisateurId: userId } });
    if (!kyc) return null;

    // Métadonnées et références de pièces, PAS les binaires. L'extrait
    // d'identité est la donnée de l'utilisateur (art. 15) ; `scoreRisque`
    // reste dehors (évaluation interne LCB-FT — en-tête de classe).
    return {
      id: kyc.id,
      statut: kyc.statut,
      niveau: kyc.niveau,
      fournisseur: kyc.fournisseur,
      referenceFournisseur: kyc.fournisseurRef,
      valideJusquAu: kyc.valideJusquAu,
      motifRefus: kyc.motifRefus,
      identiteExtrait: kyc.identiteExtrait,
      creeLe: kyc.createdAt,
      modifieLe: kyc.updatedAt,
    };
  }

  private documents(userId: number): Promise<Record<string, unknown>[]> {
    return this.lirePages(async (apresId) => {
      const page = await this.dataSource.getRepository(DocumentEntity).find({
        where: this.keyset<DocumentEntity>({ userId }, apresId),
        order: { id: 'ASC' },
        take: TAILLE_PAGE,
      });
      return page.map((d) => ({
        id: d.id,
        type: d.type,
        rattacheA: d.relatedTo,
        nomOriginal: d.originalName,
        typeMime: d.mimeType,
        tailleOctets: d.sizeBytes,
        projetId: d.projectId,
        investissementId: d.investmentId,
        deposeLe: d.createdAt,
      }));
    });
  }

  private async wallets(userId: number): Promise<Record<string, unknown>[]> {
    const wallets = await this.dataSource
      .getRepository(WalletEntity)
      .find({ where: { proprietaireUserId: userId }, order: { id: 'ASC' } });
    return wallets.map((w) => ({
      id: w.id,
      type: w.type,
      devise: w.devise,
      solde: w.solde,
      soldeBloque: w.soldeBloque,
      statut: w.statut,
      referenceFournisseur: w.fournisseurRef,
      creeLe: w.createdAt,
    }));
  }

  private async transactions(
    walletIds: string[],
  ): Promise<Record<string, unknown>[]> {
    if (walletIds.length === 0) return [];
    return this.lirePages(async (apresId) => {
      // Un mouvement appartient au compte dès qu'un de SES wallets est à la
      // source ou à la destination — les deux branches du OR portent le keyset.
      const page = await this.dataSource.getRepository(TransactionEntity).find({
        where: [
          this.keyset<TransactionEntity>(
            { walletSource: In(walletIds) },
            apresId,
          ),
          this.keyset<TransactionEntity>(
            { walletDestination: In(walletIds) },
            apresId,
          ),
        ],
        order: { id: 'ASC' },
        take: TAILLE_PAGE,
      });
      return page.map((t) => ({
        id: t.id,
        sens:
          t.walletSource !== null && walletIds.includes(t.walletSource)
            ? 'debit'
            : 'credit',
        montant: t.montant,
        devise: t.devise,
        type: t.type,
        statut: t.statut,
        fournisseur: t.fournisseur,
        referenceExterne: t.referenceExterne,
        fraisPsp: t.fraisPsp,
        fraisPlateforme: t.fraisPlateforme,
        motifEchec: t.motifEchec,
        projetId: t.projetId,
        investissementId: t.investissementId,
        echeanceId: t.echeanceId,
        creeLe: t.createdAt,
      }));
    });
  }

  private investissements(userId: number): Promise<Record<string, unknown>[]> {
    return this.lirePages(async (apresId) => {
      const page = await this.dataSource.getRepository(InvestmentEntity).find({
        where: this.keyset<InvestmentEntity>({ utilisateurId: userId }, apresId),
        order: { id: 'ASC' },
        take: TAILLE_PAGE,
      });
      return page.map((i) => ({
        id: i.id,
        projetId: i.projetId,
        montant: i.montant,
        instrument: i.instrument,
        nbTitres: i.nbTitres,
        valeurTitre: i.valeurTitre,
        statut: i.statut,
        retractationJusquAu: i.delaiRetractationJusquAu,
        bulletinDocumentId: i.bulletinDocId,
        signatureId: i.signatureId,
        creeLe: i.createdAt,
        modifieLe: i.updatedAt,
      }));
    });
  }

  private ordresMarche(userId: number): Promise<Record<string, unknown>[]> {
    return this.lirePages(async (apresId) => {
      const page = await this.dataSource.getRepository(OrdreMarcheEntity).find({
        where: [
          this.keyset<OrdreMarcheEntity>({ vendeurId: userId }, apresId),
          this.keyset<OrdreMarcheEntity>({ acheteurId: userId }, apresId),
        ],
        order: { id: 'ASC' },
        take: TAILLE_PAGE,
      });
      // La contrepartie est un TIERS : on restitue le rôle de l'utilisateur
      // dans l'ordre, jamais l'identifiant de l'autre partie (anti-IDOR).
      return page.map((o) => ({
        id: o.id,
        role: o.vendeurId === userId ? 'vendeur' : 'acheteur',
        investissementId: o.investissementId,
        sens: o.sens,
        nbFractions: o.nbFractions,
        montant: o.montant,
        prixUnitaire: o.prixUnitaire,
        statut: o.statut,
        interetNbFractions: o.interetNbFractions,
        interetExprimeLe: o.interetExprimeLe,
        accepteLe: o.accepteLe,
        valideJusquAu: o.valideJusquAu,
        creeLe: o.createdAt,
      }));
    });
  }

  private async distributions(
    investissementIds: string[],
  ): Promise<Record<string, unknown>[]> {
    if (investissementIds.length === 0) return [];
    return this.lirePages(async (apresId) => {
      const page = await this.dataSource
        .getRepository(DistributionPartEntity)
        .find({
          where: this.keyset<DistributionPartEntity>(
            { investissementId: In(investissementIds) },
            apresId,
          ),
          order: { id: 'ASC' },
          take: TAILLE_PAGE,
        });
      return page.map((d) => ({
        id: d.id,
        periodeDistributionId: d.periodeDistributionId,
        investissementId: d.investissementId,
        pourcentageDetention: d.pourcentageDetention,
        montantBrut: d.montantBrut,
        prelevementIR: d.prelevementIR,
        prelevementCSG: d.prelevementCSG,
        montantNet: d.montantNet,
        payeLe: d.payeLe,
      }));
    });
  }

  private async preferences(
    userId: number,
  ): Promise<Record<string, unknown> | null> {
    const prefs = await this.dataSource
      .getRepository(UserPreferencesEntity)
      .findOne({ where: { userId } });
    if (!prefs) return null;
    return {
      langue: prefs.langue,
      masquerMontants: prefs.masquerMontants,
      notifEmail: prefs.notifEmail,
      notifSms: prefs.notifSms,
      notifMarketing: prefs.notifMarketing,
      doubleAuthentification: prefs.twoFactorEnabled,
      deviseAffichage: prefs.preferredCurrency,
      reinvestissementLoyers: prefs.reinvestLoyers,
      reinvestissementProjetId: prefs.reinvestProjetId,
      modifieLe: prefs.updatedAt,
    };
  }

  private reclamations(userId: number): Promise<Record<string, unknown>[]> {
    return this.lirePages(async (apresId) => {
      const page = await this.dataSource.getRepository(ReclamationEntity).find({
        where: this.keyset<ReclamationEntity>(
          { utilisateurId: userId },
          apresId,
        ),
        order: { id: 'ASC' },
        take: TAILLE_PAGE,
      });
      // `traiteParUserId` (agent) est un tiers — masqué.
      return page.map((r) => ({
        id: r.id,
        reference: r.reference,
        categorie: r.categorie,
        objet: r.objet,
        description: r.description,
        projetId: r.projetId,
        investissementId: r.investissementId,
        statut: r.statut,
        accuseReceptionLe: r.accuseReceptionLe,
        reponse: r.reponse,
        reponduLe: r.reponduLe,
        echeanceReponse: r.echeanceReponse,
        creeLe: r.createdAt,
      }));
    });
  }

  /**
   * Demandes d'accès porteur de la personne (lot 4).
   *
   * Restitué : sa motivation, la décision, ses dates, le motif CODÉ et son
   * libellé, la version des CGU acceptée. MASQUÉ :
   *  - `decideurAdminId` — un tiers, même raison que `traiteParUserId` d'une
   *    réclamation ;
   *  - `motifRefusComplement` — note interne d'instruction, exclue au même
   *    titre que les évaluations LCB-FT (voir l'en-tête de classe). Point
   *    signalé à la conformité : si l'analyse retient qu'elle constitue une
   *    donnée personnelle communicable (art. 15), c'est ici qu'elle s'ajoute.
   * Pagination keyset, comme le reste du service.
   */
  private demandesAccesPorteur(
    userId: number,
  ): Promise<Record<string, unknown>[]> {
    return this.lirePages(async (apresId) => {
      const page = await this.dataSource
        .getRepository(DemandeAccesPorteurEntity)
        .find({
          where: this.keyset<DemandeAccesPorteurEntity>(
            { utilisateurId: userId },
            apresId,
          ),
          order: { id: 'ASC' },
          take: TAILLE_PAGE,
        });
      return page.map((d) => ({
        id: d.id,
        statut: d.statut,
        motivation: d.motivation,
        cguVersionAcceptee: d.cguVersionAcceptee,
        soumiseLe: d.soumiseLe,
        decideeLe: d.decideeLe,
        motifRefus: d.motifRefus,
        motifRefusLibelle: d.motifRefus
          ? LIBELLES_MOTIF_REFUS[d.motifRefus]
          : null,
      }));
    });
  }

  private async parrainage(userId: number): Promise<Record<string, unknown>> {
    const repo = this.dataSource.getRepository(ParrainageAttributionEntity);
    const [user, commeParrain, commeFilleul] = await Promise.all([
      this.dataSource.getRepository(UserEntity).findOne({ where: { userId } }),
      repo.find({ where: { parrainId: userId }, order: { id: 'ASC' } }),
      repo.find({ where: { filleulId: userId }, order: { id: 'ASC' } }),
    ]);

    // Filleuls et parrain sont des TIERS : seuls les montants, statuts et
    // dates des attributions de l'utilisateur sont restitués.
    return {
      monCodeParrainage: user?.codeParrainage ?? null,
      inscritViaParrainage: (user?.parrainePar ?? null) !== null,
      attributionsCommeParrain: commeParrain.map((a) => ({
        id: a.id,
        montantBase: a.montantBase,
        bonusEur: a.bonusParrainEur,
        statut: a.statut,
        creeLe: a.creeLe,
      })),
      attributionsCommeFilleul: commeFilleul.map((a) => ({
        id: a.id,
        montantBase: a.montantBase,
        bonusEur: a.bonusFilleulEur,
        statut: a.statut,
        creeLe: a.creeLe,
      })),
    };
  }

  // ── Outils ────────────────────────────────────────────────────────────────

  /** Ajoute la borne keyset (`id > dernier id vu`) à une clause where. */
  private keyset<T extends { id: string }>(
    where: FindOptionsWhere<T>,
    apresId: string | null,
  ): FindOptionsWhere<T> {
    return apresId === null
      ? where
      : ({ ...where, id: MoreThan(apresId) } as FindOptionsWhere<T>);
  }

  /**
   * Déroule toutes les pages d'une lecture keyset. Chaque page rend des lignes
   * DÉJÀ projetées mais dont `id` sert de curseur ; la boucle s'arrête à la
   * première page incomplète.
   */
  private async lirePages(
    chargerPage: (apresId: string | null) => Promise<Record<string, unknown>[]>,
  ): Promise<Record<string, unknown>[]> {
    const lignes: Record<string, unknown>[] = [];
    let apresId: string | null = null;
    for (;;) {
      const page = await chargerPage(apresId);
      lignes.push(...page);
      if (page.length < TAILLE_PAGE) break;
      apresId = page[page.length - 1].id as string;
    }
    return lignes;
  }
}
