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
