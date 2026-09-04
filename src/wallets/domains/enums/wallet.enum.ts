export enum WalletType {
  INVESTISSEUR = 'investisseur',
  TECHNIQUE_PROJET = 'technique_projet',
  SPV = 'spv',
  FRAIS_PLATEFORME = 'frais_plateforme',
  TAXES = 'taxes',
  SEQUESTRE_IR = 'sequestre_ir',   // Wallet séquestre pour Impôt sur le Revenu (12.8%)
  SEQUESTRE_CSG = 'sequestre_csg', // Wallet séquestre pour CSG/CRDS (17.2%)
}

/**
 * Portefeuilles TENUS PAR LA PLATEFORME, par opposition au portefeuille
 * personnel d'un investisseur.
 *
 * Sert de critère de légitimité aux écritures passées à la main depuis le
 * back-office (`POST /wallets/transactions`) : une opération d'exploitation
 * touche toujours, d'un côté au moins, un portefeuille de la plateforme —
 * trésorerie d'un projet, SCI, frais, taxes, séquestre fiscal. Une écriture
 * dont les DEUX extrémités sont des portefeuilles d'investisseurs n'est pas
 * une opération d'exploitation : c'est un virement entre deux personnes, que
 * seuls les parcours métier (souscription, cession, distribution) ont le droit
 * de produire, avec leurs contrôles.
 */
export const TYPES_WALLET_PLATEFORME: readonly WalletType[] = [
  WalletType.TECHNIQUE_PROJET,
  WalletType.SPV,
  WalletType.FRAIS_PLATEFORME,
  WalletType.TAXES,
  WalletType.SEQUESTRE_IR,
  WalletType.SEQUESTRE_CSG,
];

export enum TransactionType {
  DEPOT = 'depot',
  RETRAIT = 'retrait',
  SOUSCRIPTION = 'souscription',
  REMBOURSEMENT_CAPITAL = 'remboursement_capital',
  PAIEMENT_INTERETS = 'paiement_interets',
  FRAIS = 'frais',
  IMPOTS = 'impots',
  ESCROW_LOCK = 'escrow_lock',
  ESCROW_RELEASE = 'escrow_release',
  INTERNE = 'interne',
  REMBOURSEMENT_COLLECTE_ECHEC = 'remboursement_collecte_echec',
  /**
   * Remboursement d'un DÉPÔT par le prestataire de paiement (`charge.refunded`) :
   * l'argent repart vers le moyen de paiement de l'investisseur, donc hors
   * plateforme — `walletSource` = portefeuille débité, `walletDestination` = NULL.
   *
   * Type distinct de `RETRAIT` À DESSEIN : la file de traitement des retraits
   * (`AdminRetraitsController`) filtre sur `type = RETRAIT`. Y faire entrer les
   * remboursements de carte demanderait aux équipes finance d'exécuter un
   * virement pour une opération que Stripe a déjà réalisée seul.
   */
  REMBOURSEMENT_DEPOT = 'remboursement_depot',
  /**
   * Entrée d'argent du PORTEUR DE PROJET vers le portefeuille technique de son
   * projet, encaissée par carte via le prestataire de paiement.
   *
   * C'est la contrepartie qui manquait au service de la dette : les échéances
   * et les distributions CRÉDITENT les investisseurs, il faut donc que le
   * projet soit d'abord ALIMENTÉ. Sans ce mouvement, chaque règlement créait
   * de l'argent que la trésorerie ne couvrait pas — visible seulement au
   * rapprochement PSP, une fois par jour, après coup.
   *
   * Contrepartie EXTERNE (la carte du porteur) : `walletSource` = NULL,
   * `walletDestination` = portefeuille technique du projet. Même forme qu'un
   * DÉPÔT investisseur, dont il se distingue par le bénéficiaire — un projet,
   * pas une personne — et par le droit de le demander, réservé au porteur.
   */
  APPORT_PORTEUR = 'apport_porteur',
}

export enum TransactionStatus {
  INITIE = 'initie',
  EN_ATTENTE_PAIEMENT = 'en_attente_paiement',
  EN_COURS = 'en_cours',
  REUSSI = 'reussi',
  ECHOUE = 'echoue',
  ANNULE = 'annule',
  REMBOURSE = 'rembourse',
  EXPIRE = 'expire',
}

/**
 * Statuts dont l'écriture a DÉJÀ déplacé un solde de portefeuille.
 *
 * Cette liste n'est pas une commodité : c'est le critère du rapprochement du
 * grand livre. « Σ crédits − Σ débits = solde » n'a de sens que si l'on somme
 * exactement les écritures dont le mouvement a été appliqué aux soldes.
 *
 *  - `REUSSI` — opération dénouée, mouvement acquis ;
 *  - `EN_COURS` / `EN_ATTENTE_PAIEMENT` — retrait EN VOL. Le portefeuille a été
 *    débité au moment de la DEMANDE (verrou pessimiste + décrément
 *    conditionnel), bien avant que la banque ne confirme. L'argent a donc déjà
 *    quitté le solde ; ne pas compter ces écritures faisait apparaître un écart
 *    négatif sur chaque portefeuille ayant un retrait en cours — c'est-à-dire
 *    une ALERTE FAUSSE, toutes les nuits, sur le contrôle financier le plus
 *    critique de la plateforme. Une alerte qui crie à tort est une alerte qu'on
 *    finit par ignorer le jour où elle a raison.
 *
 * Exclus, et pour de bonnes raisons :
 *  - `INITIE` — intention de paiement ouverte, aucun solde touché ;
 *  - `ECHOUE` / `ANNULE` / `REMBOURSE` — le mouvement a été DÉFAIT (recrédit
 *    idempotent) : compter l'écriture rouvrirait un écart que le recrédit vient
 *    justement de refermer ;
 *  - `EXPIRE` — n'a jamais rien déplacé.
 */
export const STATUTS_MOUVEMENT_APPLIQUE: readonly TransactionStatus[] = [
  TransactionStatus.REUSSI,
  TransactionStatus.EN_COURS,
  TransactionStatus.EN_ATTENTE_PAIEMENT,
] as const;

/**
 * Prestataire à l'origine d'un mouvement, persisté en clair dans
 * `transaction.fournisseur` (colonne `varchar`, sans contrainte d'énumération
 * en base).
 *
 * `CINETPAY` et `FEDAPAY` sont deux agrégateurs de mobile money ouest-africain.
 * Ils n'ont JAMAIS eu d'adaptateur : aucun code n'a jamais produit ni consulté
 * une transaction portant ces valeurs, et le mobile money n'a aucune pertinence
 * sur le marché retenu. Ils sont conservés ici, et nulle part ailleurs, pour
 * une seule raison : ce sont des VALEURS PERSISTABLES. Toute ligne historique
 * qui les porterait — base de démonstration, export, sauvegarde — doit
 * continuer à se relire sans que le mapper ne lève. Les retirer transformerait
 * une donnée d'historique en valeur inconnue.
 *
 * Ils ne doivent donc être proposés nulle part : ni écrits par un use case, ni
 * exposés dans un libellé de moyen de paiement, ni offerts comme filtre à
 * l'utilisateur. Un nouveau flux se rattache à `STRIPE`, `MANUEL` ou `INTERNE`.
 */
export enum TransactionFournisseur {
  STRIPE = 'stripe',
  /** Historique seulement — jamais écrit par le produit. Voir le commentaire ci-dessus. */
  CINETPAY = 'cinetpay',
  /** Historique seulement — jamais écrit par le produit. Voir le commentaire ci-dessus. */
  FEDAPAY = 'fedapay',
  MANUEL = 'manuel',
  INTERNE = 'interne',
}
