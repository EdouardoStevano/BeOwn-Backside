/**
 * Fixtures RÉDACTIONNELLES du seed — module pur, sans TypeORM ni NestJS.
 *
 * Regroupe ce qui est du TEXTE et non du flux : documents d'informations clés
 * (colonne jsonb `fici` des projets), personas ajoutés pour le marché
 * La Réunion / France, actualités. Le SeedService reste ainsi centré sur les
 * insertions et les écritures financières.
 */
import {
  ContenuFici,
  SectionFici,
  verifierFici,
} from 'src/projects/domains/fici';

// ─── Document d'informations clés ─────────────────────────────────────────────

export interface ParametresFici {
  /** Raison sociale du porteur de l'opération. */
  porteur: string;
  /** Ville d'immatriculation du porteur. */
  villePorteur: string;
  /** Description courte du bien (« immeuble de 6 appartements loués… »). */
  bien: string;
  /** Localisation du bien. */
  villeBien: string;
  /** Dénomination de la société support (SPV) — null si non constituée. */
  societeSupport: string | null;
  nbParts: number;
  prixPart: number;
  capitalCible: number;
  capitalMinimum: number;
  triCible: number;
  dureeMois: number;
}

const eur = (n: number): string => `${n.toLocaleString('fr-FR')} €`;

/**
 * Contenu complet et VALIDE au sens de `verifierFici` : les 8 sections du
 * gabarit sont remplies, la langue est le français, la longueur sous la
 * limite éditoriale. La complétude est verrouillée par une assertion — un
 * gabarit qui régresserait ferait échouer le seed au lieu de publier des
 * projets ouverts sans document conforme.
 */
export function ficiComplet(p: ParametresFici): ContenuFici {
  const support =
    p.societeSupport ??
    `la société support en cours de constitution pour l'opération`;

  const contenu: ContenuFici = {
    sections: {
      [SectionFici.PORTEUR_ET_OPERATION]:
        `L'opération est portée par ${p.porteur}, immatriculée à ${p.villePorteur}, ` +
        `qui a déjà mené des opérations locatives comparables. Il n'existe aucun lien ` +
        `capitalistique ou familial entre le porteur et BeOwn, ses dirigeants ou ses salariés. ` +
        `BeOwn intervient exclusivement comme opérateur de la plateforme : elle n'est ni ` +
        `émettrice des parts, ni bénéficiaire de la souscription.`,
      [SectionFici.BIEN_ET_OPERATION]:
        `Le bien est ${p.bien}, situé à ${p.villeBien}. Le prix d'acquisition se décompose ` +
        `entre le bien lui-même, les frais d'acquisition, les travaux prévus et une réserve ` +
        `de trésorerie. La situation locative à la date du document et le calendrier des ` +
        `travaux sont détaillés dans la description de l'opération. Les diagnostics ` +
        `réglementaires ont été réalisés.`,
      [SectionFici.SOCIETE_SUPPORT]:
        `Le bien est détenu par ${support}. Le capital est divisé en ${p.nbParts.toLocaleString('fr-FR')} parts ` +
        `de ${eur(p.prixPart)} chacune. La part donne droit aux distributions et au vote en ` +
        `assemblée ; elle ne confère aucun droit de jouissance du bien. Les statuts prévoient ` +
        `une clause d'agrément pour toute cession. Le registre des associés est tenu par la ` +
        `gérance de la société support. L'étendue de la responsabilité des associés au titre ` +
        `des dettes sociales est limitée aux apports, dans les conditions prévues aux statuts.`,
      [SectionFici.CONDITIONS_SOUSCRIPTION]:
        `Souscription minimum : ${eur(p.prixPart)} (une part). Objectif de collecte : ` +
        `${eur(p.capitalCible)} ; montant minimum de réalisation : ${eur(p.capitalMinimum)}. ` +
        `Si la collecte n'atteint pas ce minimum à la date de clôture, l'intégralité des fonds ` +
        `est restituée aux souscripteurs, sans frais. Entre la souscription et la remise des ` +
        `parts : signature électronique du bulletin, règlement depuis le portefeuille, puis ` +
        `inscription au registre des associés sous quinzaine.`,
      [SectionFici.REVENUS_ET_SORTIE]:
        `Le revenu provient des loyers effectivement encaissés, desquels sont déduits les ` +
        `charges, taxes, provisions et frais avant toute distribution. Les distributions sont ` +
        `mensuelles et leur montant est variable. Objectif de rendement publié : ` +
        `${p.triCible.toLocaleString('fr-FR')} % par an — il repose sur des hypothèses ` +
        `d'occupation et n'est pas garanti. Durée de détention indicative : ${p.dureeMois} mois, ` +
        `prorogeable selon les conditions de marché. Sortie : cession des parts sur le tableau ` +
        `d'affichage de la plateforme ou cession du bien par la société support ; BeOwn ne ` +
        `rachète pas les parts. Le traitement fiscal dépend de la situation personnelle de ` +
        `chaque investisseur.`,
      [SectionFici.FACTEURS_DE_RISQUE]:
        `Risques propres à l'opération : concentration sur un actif immobilier unique ; ` +
        `dépendance aux locataires en place (un impayé ou une vacance prolongée réduit ` +
        `directement les distributions) ; sensibilité au marché locatif local de ${p.villeBien} ; ` +
        `aléas de travaux pouvant retarder la mise en location ou renchérir l'opération. ` +
        `Chacun de ces événements peut réduire les distributions ou entamer le capital.`,
      [SectionFici.FRAIS]:
        `Les frais supportés sont ceux publiés par la plateforme (GET /public/platform-fees) : ` +
        `commission annuelle de plateforme assise sur le capital initial investi, prélevée ` +
        `mensuellement sur les distributions ; frais de gestion locative assis sur les loyers ` +
        `encaissés, prélevés à chaque distribution ; commissions de cession sur le marché ` +
        `secondaire et commission sur la plus-value à la vente du bien. Exemple : pour 100 € de ` +
        `loyers bruts revenant à l'opération, les frais courants représentent de l'ordre de ` +
        `18 € avant fiscalité, soit un revenu net distribuable d'environ 82 €.`,
      [SectionFici.DROITS_ET_RECOURS]:
        `Information périodique : compte rendu locatif mensuel et rapport annuel, disponibles ` +
        `dans l'espace investisseur. Les droits d'associé s'exercent selon les statuts de la ` +
        `société support. Si vous relevez de la catégorie des investisseurs non avertis, vous ` +
        `disposez du délai de réflexion servi par la plateforme au moment de la souscription. ` +
        `Réclamations : depuis l'espace personnel (rubrique « Réclamations »), procédure ` +
        `gratuite, accusé de réception sous dix jours ouvrables et réponse motivée sous deux ` +
        `mois. Voir aussi les conditions générales d'utilisation et les mentions légales.`,
    },
    nombrePages: 5,
    langue: 'fr',
    version: 1,
    dateVersion: new Date().toISOString(),
  };

  const verdict = verifierFici(contenu);
  if (!verdict.valide) {
    throw new Error(
      `Fixture fici invalide (sections manquantes : ${verdict.sectionsManquantes.join(', ')} ; ` +
        `anomalies : ${verdict.anomalies.join(' / ')})`,
    );
  }
  return contenu;
}

/**
 * Document INCOMPLET pour le projet en brouillon : montre à l'écran admin le
 * contrôle de complétude (6 sections manquantes) sans bloquer quoi que ce
 * soit — un brouillon n'ouvre ni collecte ni réservation.
 */
export function ficiPartiel(porteur: string, bien: string): ContenuFici {
  return {
    sections: {
      [SectionFici.PORTEUR_ET_OPERATION]:
        `L'opération est portée par ${porteur}. Dossier en cours d'instruction.`,
      [SectionFici.BIEN_ET_OPERATION]: `${bien}. Description détaillée à compléter.`,
    },
    nombrePages: 2,
    langue: 'fr',
    version: 1,
    dateVersion: new Date().toISOString(),
  };
}

// ─── Actualités ───────────────────────────────────────────────────────────────

export interface ActualiteSeed {
  slug: string;
  titreFr: string;
  resumeFr: string;
  contenuFr: string;
  category: string;
  publiee: boolean;
  /** Ancienneté de publication, en jours. */
  ageJours: number;
}

export const ACTUALITES: ActualiteSeed[] = [
  {
    slug: 'beown-ouvre-la-reunion',
    titreFr: 'BeOwn ouvre ses premières opérations à La Réunion',
    resumeFr:
      'Trois opérations locatives réunionnaises rejoignent la plateforme, de Saint-Denis au Tampon.',
    contenuFr:
      `## BeOwn s'implante à La Réunion\n\n` +
      `La plateforme accueille ses premières opérations locatives sur l'île : ` +
      `la Résidence Océane à Saint-Denis, Cœur de Ville à Saint-Pierre et Les ` +
      `Flamboyants au Tampon. Chaque opération est portée par un acteur local et ` +
      `détaille son document d'informations clés avant toute souscription.\n\n` +
      `Investir comporte un risque de perte en capital. Placement illiquide.`,
    category: 'plateforme',
    publiee: true,
    ageJours: 14,
  },
  {
    slug: 'residence-les-jardins-troisieme-distribution',
    titreFr: 'Résidence Les Jardins : troisième distribution mensuelle versée',
    resumeFr:
      'Les loyers du mois écoulé ont été distribués aux associés, après validation du compte rendu locatif.',
    contenuFr:
      `## Une troisième distribution conforme au prévisionnel\n\n` +
      `Le loyer mensuel encaissé par la société support a été validé puis distribué ` +
      `aux investisseurs au prorata de leurs parts, net des frais de plateforme et ` +
      `des prélèvements fiscaux à la source (IR 12,8 % et prélèvements sociaux 17,2 %).\n\n` +
      `Les performances passées ne préjugent pas des performances futures.`,
    category: 'projets',
    publiee: true,
    ageJours: 5,
  },
  {
    slug: 'marche-secondaire-mode-emploi',
    titreFr: 'Céder ses parts : comment fonctionne le tableau d’affichage',
    resumeFr:
      'Publier une annonce, recevoir une marque d’intérêt, accepter — la cession pas à pas.',
    contenuFr:
      `## Le tableau d'affichage, pas à pas\n\n` +
      `Un investisseur peut publier une annonce de cession au prix de son choix. ` +
      `La plateforme n'apparie pas les ordres : elle transmet les marques d'intérêt ` +
      `au vendeur, qui reste libre d'accepter. La cession n'a lieu qu'après signature ` +
      `du contrat par l'acheteur.\n\n` +
      `La revente n'est pas garantie : le placement reste illiquide.`,
    category: 'guide',
    publiee: true,
    ageJours: 30,
  },
  {
    slug: 'bilan-locatif-semestre',
    titreFr: 'Bilan locatif du semestre (brouillon)',
    resumeFr: 'Brouillon interne — taux d’occupation et loyers encaissés par opération.',
    contenuFr: `## Brouillon\n\nContenu en cours de rédaction par l'équipe.`,
    category: 'plateforme',
    publiee: false,
    ageJours: 1,
  },
];
