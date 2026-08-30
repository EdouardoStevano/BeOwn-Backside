/**
 * Document d'informations clés d'une opération BeOwn.
 *
 * SOURCE DE VÉRITÉ RÉDACTIONNELLE :
 * `docs/conformite/2026-08-29-gabarit-document-informations-cles.md` (dépôt
 * Frontside). Les clés de section, les intitulés, les avertissements et les
 * messages de refus ci-dessous en sont la transcription littérale. Aucun de ces
 * textes ne se modifie ici sans mise à jour préalable du gabarit : ils engagent
 * la plateforme vis-à-vis de ses investisseurs.
 *
 * Points structurants :
 *
 *  - le document est établi par le PORTEUR de l'opération, sous sa
 *    responsabilité ; BeOwn en contrôle la complétude et la cohérence formelle ;
 *  - il tient en six pages A4 au maximum hors annexes — règle éditoriale
 *    interne de concision, pas une contrainte externe ;
 *  - il est rédigé en français, langue de présentation de l'opération ;
 *  - il porte en tête deux avertissements, reproduits mot pour mot ;
 *  - il est mis à disposition AVANT tout engagement — souscription comme
 *    réservation : c'est la raison d'être de `verifierFici`.
 *
 * Le nom technique « fici » (nom du fichier, de la colonne jsonb et des
 * identifiants) est conservé tel quel : il n'est jamais affiché à un
 * utilisateur, et le renommer coûterait une migration pour un gain nul.
 */

/** Longueur maximale, hors annexes — règle éditoriale interne de concision. */
export const NOMBRE_MAX_PAGES = 6;

/** Langue de rédaction attendue, code ISO 639-1. */
export const LANGUE_ATTENDUE = 'fr';

/**
 * Avertissement liminaire, en tête du document et mis en évidence.
 * Gabarit §4.1 — texte à reproduire tel quel.
 */
export const AVERTISSEMENT_LIMINAIRE =
  "Ce document est établi par le porteur de l'opération et publié par BeOwn. " +
  "Il n'a été vérifié ni approuvé par aucune autorité publique. BeOwn ne " +
  "détient à ce jour aucun agrément d'autorité de marché. En souscrivant, " +
  "vous assumez l'intégralité du risque de l'opération, y compris le risque " +
  'de perte partielle ou totale des sommes investies.';

/**
 * Absence de garantie, immédiatement après l'avertissement liminaire.
 * Gabarit §4.2. Phrase identique à celle publiée dans les mentions légales
 * (`landing:pages.legal.statusP2`) : si les mentions légales évoluent, cette
 * constante évolue avec elles, pour qu'une seule formulation circule.
 */
export const AVERTISSEMENT_ABSENCE_GARANTIE =
  "Les sommes investies ne bénéficient d'aucune garantie publique, d'aucun " +
  "fonds d'indemnisation des investisseurs et d'aucune garantie des dépôts.";

/**
 * Délai de réflexion — section 8. Gabarit §4.3.
 * Engagement contractuel propre à BeOwn, implémenté par
 * `src/investments/domains/retractation.ts` (quatre jours calendaires).
 */
export const MENTION_DELAI_REFLEXION =
  'Si vous relevez de la catégorie des investisseurs non avertis au sens du ' +
  "questionnaire de la plateforme, vous disposez d'un délai de réflexion de " +
  'quatre jours calendaires à compter de votre souscription, pendant lequel ' +
  'vous pouvez y renoncer sans avoir à vous justifier et sans pénalité.';

/** Absence de conseil — section 1. Gabarit §4.4. */
export const MENTION_ABSENCE_CONSEIL =
  "BeOwn ne fournit aucun conseil en investissement et n'émet aucune " +
  'recommandation personnalisée. La présence de cette opération sur la ' +
  "plateforme signifie qu'elle a passé son processus d'analyse interne ; elle " +
  'ne préjuge ni de sa qualité, ni de son résultat, ni de son caractère ' +
  'approprié à votre situation.';

/** Responsabilité du contenu — pied du document. Gabarit §4.5. */
export const MENTION_RESPONSABILITE_CONTENU =
  'Le contenu de ce document est établi sous la responsabilité du porteur de ' +
  "l'opération. BeOwn en contrôle la complétude et la cohérence formelle ; " +
  "elle ne garantit ni l'exactitude ni l'exhaustivité des informations " +
  'fournies par le porteur.';

/**
 * Marqueur à porter en section 3 tant que l'étendue de la responsabilité des
 * associés de la société support n'a pas été tranchée (gabarit §4.6 et §7,
 * point 1 : décision d'avocat). Il est SERVI à la saisie, jamais imposé : le
 * contrôle automatique ne peut pas trancher une question de droit, et bloquer
 * dessus interdirait toute ouverture de collecte.
 */
export const MARQUEUR_RESPONSABILITE_ASSOCIES =
  '[À COMPLÉTER : étendue de la responsabilité des associés au titre des ' +
  'dettes de la société support]';

/**
 * Sections du document, dans l'ordre d'affichage. Gabarit §3.
 *
 * Le nom du type reste `SectionFici` — identifiant technique, jamais affiché.
 * Seules les VALEURS (clés persistées dans le jsonb) et les intitulés relèvent
 * du gabarit.
 */
export enum SectionFici {
  /** 1 — porteur, dirigeants, liens éventuels avec BeOwn, rôle de BeOwn. */
  PORTEUR_ET_OPERATION = 'porteur_et_operation',
  /** 2 — le bien, son prix, sa situation locative, les travaux. */
  BIEN_ET_OPERATION = 'bien_et_operation',
  /** 3 — la société support, les parts et ce qu'elles donnent. */
  SOCIETE_SUPPORT = 'societe_support',
  /** 4 — minimum, cible, calendrier, sort des fonds si la collecte échoue. */
  CONDITIONS_SOUSCRIPTION = 'conditions_souscription',
  /** 5 — production du revenu, distributions, durée, modalités de sortie. */
  REVENUS_ET_SORTIE = 'revenus_et_sortie',
  /** 6 — risques PROPRES à ce bien et à cette opération. */
  FACTEURS_DE_RISQUE = 'facteurs_de_risque',
  /** 7 — frais, assiettes, taux, moment du prélèvement, exemple chiffré. */
  FRAIS = 'frais',
  /** 8 — information périodique, droits d'associé, réflexion, réclamation. */
  DROITS_ET_RECOURS = 'droits_et_recours',
}

/** Ordre canonique : celui de la déclaration de l'énumération. */
export const SECTIONS_REQUISES: SectionFici[] = Object.values(SectionFici);

/** Intitulés affichés — gabarit §3, mot pour mot. */
export const INTITULES_SECTIONS: Record<SectionFici, string> = {
  [SectionFici.PORTEUR_ET_OPERATION]: "1 — Qui porte l'opération",
  [SectionFici.BIEN_ET_OPERATION]: "2 — Le bien immobilier et l'opération",
  [SectionFici.SOCIETE_SUPPORT]: '3 — La société support et vos parts',
  [SectionFici.CONDITIONS_SOUSCRIPTION]: '4 — Conditions de la souscription',
  [SectionFici.REVENUS_ET_SORTIE]: '5 — Revenus attendus et sortie',
  [SectionFici.FACTEURS_DE_RISQUE]:
    "6 — Facteurs de risque propres à l'opération",
  [SectionFici.FRAIS]: '7 — Frais',
  [SectionFici.DROITS_ET_RECOURS]: '8 — Vos droits et vos recours',
};

/**
 * Aide à la saisie, section par section — gabarit §3, « contenu attendu ».
 * Ce sont des consignes destinées au rédacteur (écran Admin), jamais des
 * textes à publier tels quels.
 */
export const AIDE_SECTIONS: Record<SectionFici, string[]> = {
  [SectionFici.PORTEUR_ET_OPERATION]: [
    'identité complète du porteur de projet, forme juridique, immatriculation, adresse',
    'qui dirige, depuis quand, quelles opérations comparables déjà menées',
    "liens capitalistiques ou familiaux éventuels avec BeOwn, ses dirigeants ou ses salariés — ou mention explicite qu'il n'en existe aucun",
    'rôle exact de BeOwn : opérateur de la plateforme, jamais émetteur, jamais partie à la souscription en qualité de bénéficiaire',
  ],
  [SectionFici.BIEN_ET_OPERATION]: [
    'localisation, nature, surface, état, année de construction',
    "prix d'acquisition et sa décomposition (bien, frais d'acquisition, travaux, réserve de trésorerie)",
    'situation locative à la date du document : occupé ou vacant, nombre de baux, loyers en place, échéances des baux',
    'travaux prévus, calendrier, qui les finance',
    'diagnostics et autorisations obtenus ou attendus',
  ],
  [SectionFici.SOCIETE_SUPPORT]: [
    'dénomination, forme, immatriculation, siège, gérance de la société support',
    `étendue de la responsabilité des associés au titre des dettes sociales — tant que ce point n'est pas tranché, porter le marqueur : ${MARQUEUR_RESPONSABILITE_ASSOCIES}`,
    "nombre total de parts, valeur de souscription d'une part, capital cible",
    'ce que la part donne et ne donne pas : droit aux distributions, droit de vote, absence de droit de jouissance du bien',
    "conditions statutaires de cession des parts, notamment l'existence d'une clause d'agrément",
    'qui tient le registre des associés et selon quelles modalités',
  ],
  [SectionFici.CONDITIONS_SOUSCRIPTION]: [
    'montant minimum de souscription, pas de souscription',
    "montant cible de la collecte, montant minimum en deçà duquel l'opération n'est pas réalisée",
    "dates d'ouverture et de clôture prévues, conditions de prorogation",
    "ce qu'il advient des fonds si la collecte n'aboutit pas",
    'étapes entre la souscription et la remise des parts, et délai indicatif de chaque étape',
  ],
  [SectionFici.REVENUS_ET_SORTIE]: [
    'comment le revenu est produit (loyers effectivement encaissés), ce qui est déduit avant distribution (charges, taxes, provisions, frais)',
    'périodicité prévue des distributions et caractère variable de leur montant',
    "objectif de rendement s'il en est publié, avec ses hypothèses et la mention qu'il n'est pas garanti",
    "durée de détention indicative et ce qui peut l'allonger",
    'modalités de sortie : cession sur le marché secondaire, cession du bien par la société support, absence de rachat par BeOwn',
    "traitement fiscal en termes généraux, avec renvoi à la situation personnelle de l'investisseur",
  ],
  [SectionFici.FACTEURS_DE_RISQUE]: [
    'les risques spécifiques à ce bien et à cette opération : concentration sur un actif unique, dépendance à un locataire, marché local, travaux, contentieux en cours, risque de change si le bien est hors zone euro',
    'pour chaque risque : ce qui le déclenche et quel effet il produit sur le capital ou sur les distributions',
    "ne pas recopier ici les risques génériques (perte en capital, illiquidité, revenus non garantis, durée variable, performances passées) : ils sont servis par la source unique de l'avertissement général sur les risques",
  ],
  [SectionFici.FRAIS]: [
    "tous les frais supportés par l'investisseur ou prélevés sur les revenus, avec leur assiette, leur taux et le moment du prélèvement",
    'les taux doivent être servis par GET /public/platform-fees, jamais saisis à la main ni codés en dur',
    'effet cumulé des frais illustré sur un exemple chiffré, revenu brut et revenu net',
  ],
  [SectionFici.DROITS_ET_RECOURS]: [
    "droit à l'information périodique : quoi, à quelle fréquence, par quel canal",
    "droits d'associé et modalités de leur exercice",
    'délai de réflexion — reprendre la mention servie par la plateforme',
    "procédure de réclamation : canal, gratuité, délai d'accusé de réception, délai de réponse",
    "renvoi aux conditions générales d'utilisation et aux mentions légales",
  ],
};

export interface ContenuFici {
  /** Contenu rédigé par le porteur, section par section. */
  sections: Partial<Record<SectionFici, string>>;
  /** Nombre de pages du document produit, annexes exclues. */
  nombrePages?: number;
  /** Langue de rédaction, code ISO 639-1. */
  langue?: string;
  /**
   * Numéro de version, incrémenté à chaque enregistrement (gabarit §5.1).
   * Posé par le serveur, jamais par le client.
   */
  version?: number;
  /** Date de la version courante, ISO 8601. Posée par le serveur. */
  dateVersion?: string;
}

export interface VerdictFici {
  valide: boolean;
  sectionsManquantes: SectionFici[];
  anomalies: string[];
}

/**
 * Contrôle la complétude d'un document avant sa mise à disposition.
 *
 * Le contrôle est volontairement FORMEL : la plateforme ne peut pas juger de
 * la véracité du contenu, qui relève de la responsabilité du porteur. Elle
 * peut en revanche refuser d'ouvrir une collecte — ou des réservations — sur
 * un document incomplet, trop long ou rédigé dans une autre langue que celle
 * de présentation de l'opération.
 */
export function verifierFici(
  contenu: ContenuFici,
  langueAttendue = LANGUE_ATTENDUE,
): VerdictFici {
  const sectionsManquantes = SECTIONS_REQUISES.filter((section) => {
    const texte = contenu.sections?.[section];
    return !texte || texte.trim().length === 0;
  });

  const anomalies: string[] = [];

  if (contenu.nombrePages != null && contenu.nombrePages > NOMBRE_MAX_PAGES) {
    anomalies.push(
      `Le document compte ${contenu.nombrePages} pages : la limite éditoriale est de ${NOMBRE_MAX_PAGES} pages A4, annexes exclues.`,
    );
  }

  if (contenu.langue && contenu.langue !== langueAttendue) {
    anomalies.push(
      `Le document est rédigé en « ${contenu.langue} » alors que l'opération est présentée en « ${langueAttendue} ».`,
    );
  }

  return {
    valide: sectionsManquantes.length === 0 && anomalies.length === 0,
    sectionsManquantes,
    anomalies,
  };
}

/** Message d'erreur exploitable directement par la couche HTTP. Gabarit §5.4. */
export function decrireVerdict(verdict: VerdictFici): string {
  const parties: string[] = [];

  if (verdict.sectionsManquantes.length > 0) {
    const intitules = verdict.sectionsManquantes
      .map((section) => INTITULES_SECTIONS[section])
      .join(' ; ');
    parties.push(
      `Sections incomplètes dans le document d'informations clés : ${intitules}.`,
    );
  }

  parties.push(...verdict.anomalies);

  return parties.join(' ');
}

/** Section prête à l'affichage ou à la saisie. */
export interface SectionRendue {
  cle: SectionFici;
  intitule: string;
  ordre: number;
  aide: string[];
  contenu: string | null;
}

/**
 * Projette un contenu (éventuellement absent) sur l'ordre canonique des
 * sections. Sert autant la fiche investisseur que l'écran de saisie : une
 * seule source pour l'ordre et les intitulés, jamais recopiés côté client.
 */
export function rendreSections(contenu?: ContenuFici | null): SectionRendue[] {
  return SECTIONS_REQUISES.map((cle, index) => {
    const texte = contenu?.sections?.[cle];
    return {
      cle,
      intitule: INTITULES_SECTIONS[cle],
      ordre: index + 1,
      aide: AIDE_SECTIONS[cle],
      contenu: texte && texte.trim().length > 0 ? texte : null,
    };
  });
}

/** Bloc d'avertissements servi tel quel aux interfaces. */
export const AVERTISSEMENTS = {
  liminaire: AVERTISSEMENT_LIMINAIRE,
  absenceGarantie: AVERTISSEMENT_ABSENCE_GARANTIE,
  absenceConseil: MENTION_ABSENCE_CONSEIL,
  delaiReflexion: MENTION_DELAI_REFLEXION,
  responsabiliteContenu: MENTION_RESPONSABILITE_CONTENU,
} as const;
