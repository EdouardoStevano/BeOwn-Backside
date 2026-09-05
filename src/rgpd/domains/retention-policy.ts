import { DocumentType } from 'src/documents/domains/enums/document-type.enum';

/**
 * Barème de conservation RGPD — transcription EN CODE du barème validé par la
 * mission conformité (dépôt Frontside,
 * `docs/conformite/2026-09-03-baremes-lot2.md`, sections 1 et 2).
 *
 * Domaine PUR : aucune dépendance framework, ORM ou réseau — tout se teste
 * avec des dates en mémoire. Les durées et points de départ sont ceux du
 * barème ; toute modification ici doit d'abord passer par une révision du
 * document de conformité (l'avocat fige les valeurs, pas le code).
 *
 * Finalités NON portées par ce module (documenté, pas oublié) :
 * - Tokens/OTP (ligne 12 du barème) : les OTP d'inscription et codes OAuth
 *   vivent dans le cache Redis avec TTL — ils expirent d'eux-mêmes, il n'y a
 *   aucune table à purger.
 * - Logs applicatifs (ligne 10) : rotation gérée par l'infrastructure de
 *   journalisation (pino/stdout → collecteur), hors base de données.
 * - Cookies (ligne 13) : côté navigateur, gérés par le bandeau front.
 * - Questionnaire d'adéquation (`questionnaire_adequation`) : PAS de finalité
 *   propre, et ce n'est pas un oubli. La table est en upsert sur
 *   `utilisateurId` (index unique) : il n'y a jamais qu'une évaluation par
 *   compte, donc aucun historique à faire vieillir, et tant que le compte est
 *   ouvert l'évaluation a une finalité vivante — elle conditionne l'accès à
 *   l'investissement (art. 21 du règlement (UE) 2020/1503). Elle suit donc la
 *   durée du COMPTE (ligne 3 du barème) : ses valeurs patrimoniales déclarées
 *   sont effacées à l'anonymisation (`AnonymizeAccountService`), la ligne
 *   entière part avec le dossier d'identité archivé à clôture + 5 ans
 *   (`KYC_ECHEANCE_POST_CLOTURE`).
 * - NIF et résidence fiscale (`profil_personne_physique`) : conservés, et
 *   désormais UTILISÉS — voir `IfuPdfService`. Régime : ligne 14 du barème
 *   (justificatifs fiscaux, 6 ans, art. L. 102 B LPF), absorbé en pratique par
 *   les dix ans comptables ; effacés à l'anonymisation en purge totale et à
 *   l'échéance du dossier archivé sinon.
 */

/** Finalités purgées par le cron RGPD, journalisées une à une (art. 5.2 RGPD). */
export enum FinalitePurge {
  /** Ligne 1 du barème : inscription jamais activée — purge complète à J+30. */
  COMPTE_JAMAIS_ACTIVE = 'compte_jamais_active',
  /** Ligne 2 : prospect activé mais sans KYC/investissement ni connexion — 3 ans. */
  PROSPECT_INACTIF = 'prospect_inactif',
  /**
   * Filet de sécurité §2 : compte passé SUPPRIME dont l'anonymisation n'a pas
   * (encore) eu lieu — échec transitoire lors de la suppression, ou stock
   * antérieur au lot 2. Traité immédiatement (durée 0).
   */
  COMPTE_SUPPRIME_A_ANONYMISER = 'compte_supprime_a_anonymiser',
  /** Ligne 4 : dossier KYC archivé, purgé 5 ans après la clôture (L. 561-12 CMF). */
  KYC_ECHEANCE_POST_CLOTURE = 'kyc_echeance_post_cloture',
  /** Ligne 11 : notifications, 12 mois après émission. */
  NOTIFICATIONS = 'notifications',
  /** Ligne 9 : journaux d'audit, 5 ans après l'événement. */
  JOURNAUX_AUDIT = 'journaux_audit',

  // ─── Finalités ajoutées par la passe RGPD (divergences code/barème) ────────

  /**
   * Ligne 8 : preuve du consentement CGU — horodatage, version ET **IP
   * d'acceptation** — conservée « durée du compte + 5 ans ».
   *
   * L'anonymisation CONSERVE délibérément ces trois champs (art. 7.1 RGPD :
   * charge de la preuve du consentement) ; rien ne les effaçait ensuite. Le
   * point de départ des cinq ans est la CLÔTURE DE LA RELATION D'AFFAIRES,
   * matérialisée par `users.anonymiseLe` — la même date que la ligne 4, règle
   * transverse n° 2 du barème. Les comptes purgés en dur (lignes 1 et 2) ne
   * sont pas concernés : leur ligne `users` disparaît entièrement, IP comprise.
   *
   * Action : purge des colonnes (mise à NULL), pas de la ligne — les écritures
   * comptables adossées au compte vivent dix ans (ligne 6).
   */
  CONSENTEMENT_CGU_POST_CLOTURE = 'consentement_cgu_post_cloture',

  /**
   * Ligne 15 : réclamations et échanges de support, 5 ans après la clôture de
   * la réclamation.
   *
   * Le barème déclare la durée depuis le lot 2 ; aucune finalité ne
   * l'appliquait. La ligne part ENTIÈREMENT à l'échéance : l'art. 26 du
   * règlement (UE) 2020/1503 impose cinq ans de conservation des données
   * relatives aux services fournis, pas davantage, et l'art. 2224 C. civ.
   * ferme le même horizon probatoire.
   *
   * Pas de découpage texte libre / squelette comme pour
   * `demande_acces_porteur` : là-bas, deux échéances distinctes (2 ans / 5 ans)
   * justifiaient deux passes ; ici tout tombe à la même date, vider l'objet et
   * la description pour garder une coquille sans finalité serait de la
   * conservation sans motif. Aucune pièce jointe à traiter : la table
   * `reclamation` n'en porte pas, et `document` n'a pas de clé vers elle.
   */
  RECLAMATIONS = 'reclamations',

  /**
   * Traces de consultation du détail d'un projet (`project_view`), 13 mois.
   *
   * Aucune ligne du barème ne les visait — elles s'accumulaient sans terme.
   * Finalité réelle : détecter la seconde consultation d'un même projet pour
   * déclencher un contact commercial (intérêt légitime, art. 6.1.f RGPD).
   * C'est une mesure d'audience nominative : la durée retenue est celle que la
   * CNIL borne pour les traceurs de mesure d'audience et les données qui en
   * découlent (ligne 13 du barème, recommandation « cookies et autres
   * traceurs » du 17 septembre 2020) — 13 mois, la plus courte des deux
   * durées qu'elle cite, parce qu'une trace de plus d'un an ne dit plus rien
   * d'une intention d'achat.
   */
  CONSULTATIONS_PROJET = 'consultations_projet',

  /**
   * Liste interne de gel des avoirs (`personne_gelee`), 5 ans après la LEVÉE
   * de la mesure.
   *
   * Tant que l'inscription est active (`actif = true`), la mesure est en
   * vigueur : la conserver est une obligation légale (art. L. 562-4 CMF, mise
   * en œuvre sans délai des mesures de gel) et rien ne se purge. À la radiation
   * (`actif = false`, horodatée par `desactiveLe`), la ligne ne sert plus qu'à
   * prouver qu'on a appliqué puis levé la mesure : 5 ans, l'horizon de la
   * ligne 9 du barème (journaux d'audit LCB-FT, art. L. 561-12 CMF et
   * art. 2224 C. civ.).
   *
   * Ces lignes décrivent des personnes potentiellement TIERCES à la
   * plateforme, qui n'ont aucun moyen d'en demander l'effacement : leur poser
   * un terme n'est pas une commodité, c'est l'art. 5.1.e RGPD.
   */
  LISTE_GEL_LEVEE = 'liste_gel_levee',

  // ─── Demandes d'accès porteur (lot 4) ────────────────────────────────────
  // Trois finalités DISTINCTES sur la même table, parce que trois données de
  // nature différente y cohabitent :
  //  - le TEXTE LIBRE (motivation du demandeur, complément interne de
  //    l'instructeur) : donnée personnelle sans obligation de conservation
  //    propre — purgée tôt, SANS supprimer la ligne ;
  //  - le SQUELETTE DE DÉCISION (statut, dates, administrateur, motif codé) :
  //    preuve que l'examen imposé par les CGU a eu lieu — conservé 5 ans ;
  //  - la demande JAMAIS DÉCIDÉE : caduque au bout de 12 mois, il n'y a
  //    aucune décision à justifier — la ligne part entièrement.
  /** Texte libre d'une demande REFUSÉE, purgé 2 ans après la décision. */
  DEMANDE_PORTEUR_TEXTE_LIBRE = 'demande_porteur_texte_libre',
  /**
   * Ligne d'une demande CLOSE (acceptée, refusée, retirée, caduque),
   * supprimée 5 ans après la clôture. Le statut `caduque` relève de CETTE
   * finalité : il est terminal, et sa date de clôture est renseignée.
   */
  DEMANDE_PORTEUR_DECISION = 'demande_porteur_decision',
  /**
   * Demande JAMAIS INSTRUITE (`soumise`, `en_examen`), supprimée 12 mois après
   * son dépôt — il n'y a aucune décision à justifier, et la conserver
   * bloquerait indéfiniment l'index unique partiel.
   *
   * Nom rectifié (lot 4b) : cette finalité s'appelait
   * `DEMANDE_PORTEUR_CADUQUE`, ce qui laissait croire qu'elle purgeait le
   * STATUT `caduque` — lequel relève en réalité de
   * `DEMANDE_PORTEUR_DECISION`, étant terminal et horodaté. Aucune valeur
   * n'est persistée en base : l'énumération ne sert qu'aux rapports et aux
   * journaux du cron.
   */
  DEMANDE_PORTEUR_JAMAIS_INSTRUITE = 'demande_porteur_jamais_instruite',
}

/** Durée de conservation d'une finalité, en unités CALENDAIRES (pas en ms). */
export interface DureeRetention {
  jours?: number;
  mois?: number;
  annees?: number;
}

export const DUREES_RETENTION: Readonly<
  Record<FinalitePurge, Readonly<DureeRetention>>
> = Object.freeze({
  [FinalitePurge.COMPTE_JAMAIS_ACTIVE]: Object.freeze({ jours: 30 }),
  [FinalitePurge.PROSPECT_INACTIF]: Object.freeze({ annees: 3 }),
  [FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER]: Object.freeze({ jours: 0 }),
  [FinalitePurge.KYC_ECHEANCE_POST_CLOTURE]: Object.freeze({ annees: 5 }),
  [FinalitePurge.NOTIFICATIONS]: Object.freeze({ mois: 12 }),
  [FinalitePurge.JOURNAUX_AUDIT]: Object.freeze({ annees: 5 }),
  [FinalitePurge.CONSENTEMENT_CGU_POST_CLOTURE]: Object.freeze({ annees: 5 }),
  [FinalitePurge.RECLAMATIONS]: Object.freeze({ annees: 5 }),
  [FinalitePurge.CONSULTATIONS_PROJET]: Object.freeze({ mois: 13 }),
  [FinalitePurge.LISTE_GEL_LEVEE]: Object.freeze({ annees: 5 }),
  [FinalitePurge.DEMANDE_PORTEUR_TEXTE_LIBRE]: Object.freeze({ annees: 2 }),
  [FinalitePurge.DEMANDE_PORTEUR_DECISION]: Object.freeze({ annees: 5 }),
  [FinalitePurge.DEMANDE_PORTEUR_JAMAIS_INSTRUITE]: Object.freeze({ mois: 12 }),
});

/**
 * Point de départ des demandes ACCEPTÉES — « durée de l'accès, puis 5 ans ».
 *
 * La fin d'accès est désormais HORODATÉE (`users.accesRevoqueLe`, lot 4b) : la
 * purge repart de cette date, à défaut de la clôture du compte
 * (`users.anonymiseLe`), à défaut de la date de décision — dans cet ordre,
 * exprimé par un `COALESCE` dans `RgpdPurgeService`. La sélection reste par
 * ailleurs bornée aux comptes dont l'accès est refermé (`porteurAccess =
 * false`) : tant qu'il court, la pièce qui justifie son octroi doit rester.
 *
 * Le repli sur `decideeLe` ne concerne que le stock antérieur au lot 4b — une
 * demande acceptée puis fermée sans que la fermeture ait été horodatée — et
 * les comptes dont la ligne `users` a disparu (suppression définitive).
 */

/**
 * Date limite de conservation pour un point de départ donné : au-delà de
 * `dateEcheance(...)`, la donnée est échue. Arithmétique calendaire (un « an »
 * est un an civil, pas 365 × 24 h) — c'est ce qu'exigent les textes cités.
 */
export function dateEcheance(
  finalite: FinalitePurge,
  pointDeDepart: Date,
): Date {
  const duree = DUREES_RETENTION[finalite];
  const echeance = new Date(pointDeDepart.getTime());
  if (duree.annees) echeance.setFullYear(echeance.getFullYear() + duree.annees);
  if (duree.mois) echeance.setMonth(echeance.getMonth() + duree.mois);
  if (duree.jours) echeance.setDate(echeance.getDate() + duree.jours);
  return echeance;
}

/** Une donnée est échue quand son échéance est STRICTEMENT dépassée. */
export function estEchu(
  finalite: FinalitePurge,
  pointDeDepart: Date,
  maintenant: Date,
): boolean {
  return dateEcheance(finalite, pointDeDepart).getTime() < maintenant.getTime();
}

/**
 * Seuil SQL équivalent : une ligne dont le point de départ est ANTÉRIEUR à
 * `seuilPurge(finalite, maintenant)` est échue. C'est l'inverse exact de
 * `dateEcheance` (on recule au lieu d'avancer), pour écrire
 * `WHERE "createdAt" < $seuil` sans recalculer l'échéance ligne à ligne.
 */
export function seuilPurge(finalite: FinalitePurge, maintenant: Date): Date {
  const duree = DUREES_RETENTION[finalite];
  const seuil = new Date(maintenant.getTime());
  if (duree.annees) seuil.setFullYear(seuil.getFullYear() - duree.annees);
  if (duree.mois) seuil.setMonth(seuil.getMonth() - duree.mois);
  if (duree.jours) seuil.setDate(seuil.getDate() - duree.jours);
  return seuil;
}

// ─── Anonymisation à la suppression de compte (barème §2) ───────────────────

/**
 * Régime d'anonymisation d'un compte supprimé (barème §2.1 / §2.2) :
 * - PURGE_TOTALE : aucune obligation de conservation (jamais de KYC engagé,
 *   jamais de transaction) — tous les identifiants directs sont écrasés,
 *   identité comprise.
 * - ARCHIVAGE_RESTREINT : le compte porte des obligations (LCB-FT et/ou
 *   comptables) — nom, prénom, date de naissance et nationalité sont CONSERVÉS
 *   5 ans post-clôture (L. 561-12 CMF, exception de l'art. 17.3.b RGPD), le
 *   reste est écrasé.
 */
export enum RegimeAnonymisation {
  PURGE_TOTALE = 'purge_totale',
  ARCHIVAGE_RESTREINT = 'archivage_restreint',
}

export interface ObligationsConservation {
  /** Un dossier KYC a été engagé (statut au-delà de « non démarré »). */
  kycEngage: boolean;
  /** Au moins une écriture wallet (dépôt, retrait, souscription, cession…). */
  aTransactions: boolean;
  /** Au moins un investissement, même soldé ou annulé. */
  aInvestissements: boolean;
}

export function regimeAnonymisation(
  obligations: ObligationsConservation,
): RegimeAnonymisation {
  return obligations.kycEngage ||
    obligations.aTransactions ||
    obligations.aInvestissements
    ? RegimeAnonymisation.ARCHIVAGE_RESTREINT
    : RegimeAnonymisation.PURGE_TOTALE;
}

/**
 * Email de remplacement, irréversible et non résoluble, unicité préservée
 * (barème §2.2, format imposé par le plan de lot).
 */
export function emailAnonymise(userId: number): string {
  return `supprime-${userId}@anonymise.invalid`;
}

// ─── Sort des pièces à la suppression (barème §2.3) ─────────────────────────

export enum SortDocument {
  /** Pièce KYC : marquée « conservation légale », purgée à clôture + 5 ans. */
  ARCHIVER_CONSERVATION_LEGALE = 'archiver_conservation_legale',
  /** Aucune obligation : suppression immédiate (fichier + ligne). */
  SUPPRIMER = 'supprimer',
  /** Pièce contractuelle/comptable/fiscale : intacte 10 ans (L. 213-1 C. conso, L. 123-22 C. com.). */
  CONSERVER = 'conserver',
}

/** Pièces du dossier KYC au sens L. 561-12 CMF (archivage 5 ans post-clôture). */
const TYPES_KYC: ReadonlyArray<DocumentType> = Object.freeze([
  DocumentType.IDENTITE,
  DocumentType.SELFIE,
  DocumentType.JUSTIFICATIF_DOMICILE,
  // Le justificatif de revenu relève de la connaissance client LCB-FT
  // (adéquation/catégorisation) : même régime que le reste du dossier.
  DocumentType.JUSTIFICATIF_REVENU,
]);

/** Pièces sans obligation de conservation propre à l'utilisateur. */
const TYPES_SUPPRIMABLES: ReadonlyArray<DocumentType> = Object.freeze([
  DocumentType.AUTRE,
]);

/**
 * Une pièce du dossier KYC au sens L. 561-12 CMF — décision PURE, partagée
 * entre le barème de conservation et le CONTRÔLE D'ACCÈS applicatif.
 *
 * Exportée parce que la liste ne doit exister qu'à un seul endroit : le
 * contrôleur des documents s'en sert pour exiger `kyc:read_documents` sur les
 * mêmes types que ceux que l'anonymisation archive. Une pièce ajoutée à
 * `TYPES_KYC` devient du même geste archivable ET protégée en lecture ; deux
 * listes parallèles auraient fini par diverger.
 */
export function estPieceKyc(type: DocumentType): boolean {
  return TYPES_KYC.includes(type);
}

/**
 * Sort d'un document RATTACHÉ À L'UTILISATEUR à la suppression du compte.
 * Règle transverse n° 1 du barème : la durée la plus longue l'emporte — tout
 * type non listé comme supprimable est conservé par défaut (contrats,
 * bulletins, certificats, IFU, documents projet…) : on ne détruit jamais par
 * omission.
 */
export function sortDocumentUtilisateur(type: DocumentType): SortDocument {
  if (estPieceKyc(type)) {
    return SortDocument.ARCHIVER_CONSERVATION_LEGALE;
  }
  if (TYPES_SUPPRIMABLES.includes(type)) {
    return SortDocument.SUPPRIMER;
  }
  return SortDocument.CONSERVER;
}

// ─── Demande d'accès porteur à l'anonymisation d'un compte (lot 4) ─────────

export enum SortDemandeAccesPorteur {
  /** Ligne détruite : aucune décision à justifier, aucune obligation. */
  SUPPRIMER = 'supprimer',
  /**
   * Ligne conservée mais VIDÉE de son texte libre (motivation, complément
   * interne) : le squelette de décision — statut, dates, administrateur, motif
   * codé, version des CGU — prouve que l'examen exigé par les CGU a eu lieu,
   * et il tient sans une seule phrase écrite par ou sur la personne.
   */
  EFFACER_TEXTE_LIBRE = 'effacer_texte_libre',
}

/**
 * Sort des demandes d'accès porteur quand le compte est anonymisé.
 *
 * Aligné sur le régime d'anonymisation, pour la même raison : sans relation
 * d'affaires (purge totale), il n'y a rien à justifier — la demande part avec
 * le reste. Avec obligations (archivage restreint), la trace de l'examen
 * survit, dépouillée de son texte libre. Le cron la supprimera ensuite à
 * l'échéance de `DEMANDE_PORTEUR_DECISION`.
 */
export function sortDemandeAccesPorteur(
  regime: RegimeAnonymisation,
): SortDemandeAccesPorteur {
  return regime === RegimeAnonymisation.PURGE_TOTALE
    ? SortDemandeAccesPorteur.SUPPRIMER
    : SortDemandeAccesPorteur.EFFACER_TEXTE_LIBRE;
}

// ─── Bornes d'exécution du cron (règle « lots bornés » du plan de lot) ──────

/** Taille d'un lot de purge : aucun DELETE/UPDATE massif sans LIMIT. */
export const TAILLE_LOT_PURGE = 200;

/**
 * Nombre maximal de lots par finalité et par exécution : borne le travail d'un
 * run (4 000 lignes max par finalité) — le stock résiduel attend le run
 * suivant, le cron est quotidien.
 */
export const MAX_LOTS_PAR_RUN = 20;
