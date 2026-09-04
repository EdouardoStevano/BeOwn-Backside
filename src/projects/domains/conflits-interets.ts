/**
 * Conflits d'intérêts — art. 8 du règlement (UE) 2020/1503, précisé par le
 * règlement délégué (UE) 2022/2111.
 *
 * Domaine pur. Deux interdictions ABSOLUES, qui ne se gèrent pas par
 * divulgation : elles se bloquent.
 *
 *  - Art. 8(1) : le prestataire ne peut avoir AUCUNE participation dans une
 *    offre proposée sur sa propre plateforme.
 *  - Art. 8(2) : il ne peut accepter comme porteur de projet ni ses
 *    actionnaires détenant au moins 20 % du capital ou des droits de vote, ni
 *    ses dirigeants, ni ses salariés, ni toute personne physique ou morale
 *    liée à eux par une relation de contrôle.
 *
 * Le reste (art. 8(3) et suivants) relève de la politique interne : mesures
 * d'identification, de prévention et de divulgation.
 */

/** Seuil de participation au-delà duquel un actionnaire est interdit d'offre. */
export const SEUIL_PARTICIPATION_ACTIONNAIRE = 0.2;

/** Nature du lien entre une personne et le prestataire. */
export enum LienAvecPrestataire {
  AUCUN = 'aucun',
  DIRIGEANT = 'dirigeant',
  SALARIE = 'salarie',
  ACTIONNAIRE = 'actionnaire',
  /** Personne liée par une relation de contrôle à l'une des précédentes. */
  PERSONNE_LIEE = 'personne_liee',
}

export interface ProfilPorteurCandidat {
  lien: LienAvecPrestataire;
  /** Part du capital ou des droits de vote détenue, entre 0 et 1. */
  participation?: number;
  /** Vrai si le porteur est le prestataire lui-même ou une de ses entités. */
  estLePrestataire?: boolean;
}

export interface VerdictConflitInterets {
  autorise: boolean;
  /** Référence de l'interdiction opposée, pour la piste d'audit. */
  motif: string | null;
}

const AUTORISE: VerdictConflitInterets = { autorise: true, motif: null };

/**
 * Détermine si un candidat peut être accepté comme porteur de projet.
 *
 * Le défaut est permissif — la plupart des porteurs n'ont aucun lien avec la
 * plateforme — mais chaque lien identifié ferme la porte sans exception
 * possible : l'art. 8 ne prévoit ni dérogation ni consentement éclairé.
 */
export function verifierEligibilitePorteur(
  candidat: ProfilPorteurCandidat,
): VerdictConflitInterets {
  if (candidat.estLePrestataire) {
    return {
      autorise: false,
      motif:
        "Art. 8(1) : le prestataire ne peut avoir aucune participation dans une offre publiée sur sa propre plateforme.",
    };
  }

  switch (candidat.lien) {
    case LienAvecPrestataire.DIRIGEANT:
      return {
        autorise: false,
        motif: "Art. 8(2) : un dirigeant du prestataire ne peut être porteur de projet.",
      };
    case LienAvecPrestataire.SALARIE:
      return {
        autorise: false,
        motif: "Art. 8(2) : un salarié du prestataire ne peut être porteur de projet.",
      };
    case LienAvecPrestataire.PERSONNE_LIEE:
      return {
        autorise: false,
        motif:
          "Art. 8(2) : une personne liée par une relation de contrôle à un dirigeant, un salarié ou un actionnaire qualifié ne peut être porteur de projet.",
      };
    case LienAvecPrestataire.ACTIONNAIRE: {
      const participation = candidat.participation ?? 0;
      if (participation >= SEUIL_PARTICIPATION_ACTIONNAIRE) {
        return {
          autorise: false,
          motif: `Art. 8(2) : un actionnaire détenant au moins ${
            SEUIL_PARTICIPATION_ACTIONNAIRE * 100
          } % du capital ou des droits de vote ne peut être porteur de projet (détention déclarée : ${Math.round(
            participation * 100,
          )} %).`,
        };
      }
      return AUTORISE;
    }
    case LienAvecPrestataire.AUCUN:
    default:
      return AUTORISE;
  }
}

/**
 * Art. 8(1) : le prestataire ne peut pas investir dans les offres de sa propre
 * plateforme. Sert de garde sur le portefeuille plateforme.
 */
export function verifierEligibiliteInvestisseur(
  estLePrestataire: boolean,
): VerdictConflitInterets {
  if (!estLePrestataire) return AUTORISE;
  return {
    autorise: false,
    motif:
      "Art. 8(1) : le prestataire ne peut participer à aucune offre de financement participatif publiée sur sa propre plateforme.",
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Décision fondateur D5 — un porteur n'investit pas dans SON projet
 *
 * Deux fondements, cumulatifs :
 *  - PRATIQUE COMMERCIALE TROMPEUSE : l'avancement d'une collecte est le
 *    principal signal donné au public. Un porteur qui souscrit sa propre offre
 *    gonfle ce signal avec son propre argent, et l'investisseur qui rejoint
 *    « une collecte à 60 % » n'achète pas ce qu'on lui montre.
 *  - CIRCULARITÉ LCB-FT : des fonds qui partent du porteur, transitent par la
 *    collecte et lui reviennent en qualité de porteur ne laissent, en sortie,
 *    aucune trace de leur origine.
 *
 * L'interdiction porte sur le PORTEUR DE CE PROJET PRÉCIS, jamais sur le rôle :
 * un porteur reste un investisseur ordinaire sur les projets des autres. La
 * clause « conflits » des CGU dit la même chose dans les deux sens — ni
 * souscrire, ni réserver, ni acquérir au marché secondaire les parts de la
 * société support d'un projet qu'on porte ; et pas de rôle porteur sur un
 * projet dont on détient déjà des parts.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Vrai si cet utilisateur est le porteur de ce projet.
 *
 * Un projet sans porteur identifié (`null` — offre montée par la plateforme)
 * n'a personne à exclure : la comparaison doit rester fausse, jamais indécise.
 */
export function estPorteurDuProjet(
  utilisateurId: number,
  porteurIdDuProjet: number | null | undefined,
): boolean {
  if (porteurIdDuProjet === null || porteurIdDuProjet === undefined) {
    return false;
  }
  return porteurIdDuProjet === utilisateurId;
}

/**
 * Le porteur d'un projet ne peut ni y souscrire, ni le réserver, ni en
 * acquérir des parts sur le marché secondaire.
 *
 * S'applique indifféremment aux sept portes d'entrée de l'argent : la règle
 * est la même, elle n'est écrite qu'ici.
 */
export function verifierInvestisseurNonPorteur(
  utilisateurId: number,
  porteurIdDuProjet: number | null | undefined,
): VerdictConflitInterets {
  if (!estPorteurDuProjet(utilisateurId, porteurIdDuProjet)) return AUTORISE;

  return {
    autorise: false,
    motif:
      'Vous portez ce projet : vous ne pouvez ni y souscrire, ni le réserver, ' +
      'ni en acquérir des parts sur le marché secondaire.',
  };
}

/**
 * Réciproque : on ne devient pas porteur d'un projet dont on détient déjà des
 * parts de la société support.
 *
 * La détention se constate en amont (positions non annulées) ; le domaine ne
 * fait qu'en tirer la conséquence.
 */
export function verifierPorteurSansPartsDeLaSocieteSupport(
  detientDejaDesParts: boolean,
): VerdictConflitInterets {
  if (!detientDejaDesParts) return AUTORISE;

  return {
    autorise: false,
    motif:
      'Vous détenez déjà des parts de la société support de ce projet : vous ' +
      "ne pouvez pas en être le porteur.",
  };
}
