/**
 * Fiche d'informations clés sur l'investissement (FICI) — art. 23 du règlement
 * (UE) 2020/1503, contenu et présentation fixés par le règlement délégué
 * (UE) 2022/2119.
 *
 * Domaine pur. Les points structurants :
 *
 *  - la FICI est établie par le PORTEUR DE PROJET, sous sa responsabilité ;
 *  - elle tient en six pages A4 au maximum, hors annexes ;
 *  - elle est rédigée dans la langue de commercialisation — en français pour
 *    une offre proposée en France ;
 *  - elle porte en tête deux avertissements de texte imposé, reproduits
 *    ci-dessous mot pour mot ;
 *  - aucune offre ne peut être ouverte sans elle : c'est la raison d'être de
 *    `verifierFici`.
 */

/** Art. 23 : longueur maximale, hors annexes. */
export const NOMBRE_MAX_PAGES = 6;

/**
 * Art. 23(6) — avertissement liminaire, à reproduire tel quel et en évidence.
 */
export const AVERTISSEMENT_LIMINAIRE =
  "Cette offre de financement participatif n'a été ni vérifiée ni approuvée par " +
  "l'Autorité des marchés financiers ni par l'Autorité européenne des marchés " +
  "financiers (AEMF). L'adéquation de votre formation et de vos connaissances n'a " +
  "pas nécessairement été évaluée avant que l'accès à cet investissement ne vous " +
  "soit accordé. En procédant à cet investissement, vous assumez l'intégralité du " +
  "risque qu'il comporte, y compris le risque de perte partielle ou totale des " +
  "sommes investies.";

/**
 * Art. 23(7) — avertissement sur l'absence de garantie des dépôts et
 * d'indemnisation des investisseurs.
 */
export const AVERTISSEMENT_ABSENCE_GARANTIE =
  "Les sommes investies ne sont pas couvertes par le système de garantie des " +
  "dépôts établi conformément à la directive 2014/49/UE. Elles ne sont pas non " +
  "plus couvertes par le système d'indemnisation des investisseurs établi " +
  "conformément à la directive 97/9/CE.";

/**
 * Art. 22 : la FICI mentionne le délai de réflexion précontractuel dont
 * dispose l'investisseur non averti.
 */
export const MENTION_DELAI_REFLEXION =
  "Si vous êtes un investisseur non averti, vous disposez d'un délai de réflexion " +
  "de quatre jours calendaires à compter de votre offre d'investissement, pendant " +
  "lequel vous pouvez la révoquer sans avoir à vous justifier et sans pénalité.";

/**
 * Sections imposées par l'annexe I du règlement (UE) 2020/1503. Les parties G
 * (prêts) et I (gestion individuelle de portefeuille de prêts) ne sont pas
 * reprises : elles ne concernent que l'octroi de prêts, hors du programme
 * d'activité retenu.
 */
export enum SectionFici {
  /** Partie A — porteur de projet et projet de financement participatif. */
  PORTEUR_ET_PROJET = 'porteur_et_projet',
  /** Partie B — caractéristiques du processus et conditions de la levée. */
  PROCESSUS_ET_CONDITIONS = 'processus_et_conditions',
  /** Partie C — facteurs de risque. */
  FACTEURS_DE_RISQUE = 'facteurs_de_risque',
  /** Partie D — informations relatives à l'offre de titres. */
  OFFRE_DE_TITRES = 'offre_de_titres',
  /** Partie E — informations sur les véhicules à finalité spécifique. */
  VEHICULE_DEDIE = 'vehicule_dedie',
  /** Partie F — droits des investisseurs. */
  DROITS_DES_INVESTISSEURS = 'droits_des_investisseurs',
  /** Partie H — frais, informations et recours juridiques. */
  FRAIS_ET_RECOURS = 'frais_et_recours',
}

export const SECTIONS_REQUISES: SectionFici[] = Object.values(SectionFici);

/** Intitulés affichés, alignés sur l'annexe I. */
export const INTITULES_SECTIONS: Record<SectionFici, string> = {
  [SectionFici.PORTEUR_ET_PROJET]:
    'A — Informations sur le porteur de projet et le projet de financement participatif',
  [SectionFici.PROCESSUS_ET_CONDITIONS]:
    'B — Principales caractéristiques du processus de financement participatif et conditions de la levée de capitaux',
  [SectionFici.FACTEURS_DE_RISQUE]: 'C — Facteurs de risque',
  [SectionFici.OFFRE_DE_TITRES]: "D — Informations relatives à l'offre de titres",
  [SectionFici.VEHICULE_DEDIE]:
    'E — Informations sur le véhicule à finalité spécifique portant le projet',
  [SectionFici.DROITS_DES_INVESTISSEURS]: 'F — Droits des investisseurs',
  [SectionFici.FRAIS_ET_RECOURS]: 'H — Frais, informations et recours juridiques',
};

export interface ContenuFici {
  /** Contenu rédigé par le porteur, section par section. */
  sections: Partial<Record<SectionFici, string>>;
  /** Nombre de pages du document produit, annexes exclues. */
  nombrePages?: number;
  /** Langue de rédaction, code ISO 639-1. */
  langue?: string;
}

export interface VerdictFici {
  valide: boolean;
  sectionsManquantes: SectionFici[];
  anomalies: string[];
}

/**
 * Contrôle la complétude d'une FICI avant publication de l'offre.
 *
 * Le contrôle est volontairement formel : la plateforme ne peut pas juger de
 * la véracité du contenu, qui relève de la responsabilité du porteur
 * (art. 23(9)). Elle peut en revanche refuser d'ouvrir une collecte dont la
 * fiche est incomplète, trop longue ou rédigée dans la mauvaise langue.
 */
export function verifierFici(
  contenu: ContenuFici,
  langueAttendue = 'fr',
): VerdictFici {
  const sectionsManquantes = SECTIONS_REQUISES.filter((section) => {
    const texte = contenu.sections[section];
    return !texte || texte.trim().length === 0;
  });

  const anomalies: string[] = [];

  if (contenu.nombrePages != null && contenu.nombrePages > NOMBRE_MAX_PAGES) {
    anomalies.push(
      `La fiche compte ${contenu.nombrePages} pages : le maximum réglementaire est de ${NOMBRE_MAX_PAGES} pages A4, annexes exclues.`,
    );
  }

  if (contenu.langue && contenu.langue !== langueAttendue) {
    anomalies.push(
      `La fiche est rédigée en « ${contenu.langue} » alors que l'offre est proposée en « ${langueAttendue} ».`,
    );
  }

  return {
    valide: sectionsManquantes.length === 0 && anomalies.length === 0,
    sectionsManquantes,
    anomalies,
  };
}

/** Message d'erreur exploitable directement par la couche HTTP. */
export function decrireVerdict(verdict: VerdictFici): string {
  const parties: string[] = [];

  if (verdict.sectionsManquantes.length > 0) {
    const intitules = verdict.sectionsManquantes
      .map((section) => INTITULES_SECTIONS[section])
      .join(' ; ');
    parties.push(`Sections manquantes dans la fiche d'informations clés : ${intitules}.`);
  }

  parties.push(...verdict.anomalies);

  return parties.join(' ');
}
