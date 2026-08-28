import { DossierDePieces } from '../aggregates/dossier-de-pieces';
import { LIBELLE_PIECE } from '../enums/type-piece-justificative.enum';

/**
 * Ce qui empêche un profil d'agir, dit en clair.
 *
 * Un code stable pour le front, un libellé pour l'écran. Les deux voyagent
 * ensemble parce qu'un profil inapte sans raison affichable renvoie le
 * titulaire à deviner ce qu'il lui reste à faire.
 */
export interface MotifInaptitude {
  code:
    | 'KYC_INCOMPLET'
    | 'PROFIL_NON_RENSEIGNE'
    | 'SOCIETE_NON_IMMATRICULEE'
    | 'BENEFICIAIRES_NON_DECLARES'
    | 'PIECES_MANQUANTES';
  libelle: string;
}

/** Le verdict rendu pour un profil : peut-il agir, et sinon pourquoi. */
export interface AptitudeDuProfil {
  peutOperer: boolean;
  motifs: MotifInaptitude[];
}

/**
 * Un profil apte, sans réserve.
 *
 * Construit ici plutôt que répété : `{ peutOperer: true, motifs: [] }` écrit à
 * trois endroits finirait par diverger d'un `motifs` oublié.
 */
const APTE: AptitudeDuProfil = { peutOperer: true, motifs: [] };

/**
 * Le titulaire peut-il agir **en son nom propre** ?
 *
 * Une seule condition, et c'est celle que la racine porte déjà : sa
 * vérification d'identité est validée et n'est pas périmée. Le profil rempli
 * n'en fait pas partie — un dossier incomplet n'empêche pas d'opérer, il
 * empêche seulement le KYC d'aboutir, ce que `peutOperer` constate en amont.
 *
 * @param peutOperer verdict de `InvestorComplianceProfile.peutOperer()`, passé
 *   plutôt que la racine elle-même : ce service n'a pas à connaître un agrégat
 *   pour en relire un booléen (§9).
 */
export function aptitudeDeLaPersonnePhysique(
  peutOperer: boolean,
): AptitudeDuProfil {
  if (peutOperer) return APTE;

  return {
    peutOperer: false,
    motifs: [
      {
        code: 'KYC_INCOMPLET',
        libelle: "Votre vérification d'identité n'est pas validée.",
      },
    ],
  };
}

/**
 * Le titulaire peut-il agir **au nom d'une de ses sociétés** ?
 *
 * Trois conditions cumulatives, et la première est celle qu'on oublie : une
 * personne morale ne signe pas, c'est une personne physique qui signe pour
 * elle. Le représentant légal doit donc être identifié — son KYC vaut pour
 * toutes ses sociétés, et c'est précisément ce que le cahier des charges
 * cherche à éviter de ressaisir.
 *
 * | Condition                        | D'où elle vient                        |
 * | -------------------------------- | -------------------------------------- |
 * | KYC du représentant validé       | `InvestorComplianceProfile.peutOperer` |
 * | société immatriculée             | `ProfilPM.estImmatriculee`             |
 * | dossier de pièces complet        | `DossierDePieces.estComplet`           |
 *
 * La complétude des pièces recouvre la déclaration des bénéficiaires : sans
 * eux, aucune pièce d'identité n'est réclamée et le dossier passerait pour
 * complet à tort. Le motif les nomme donc séparément, pour que l'écran envoie
 * le titulaire au bon formulaire.
 *
 * **Un Domain Service**, et non une méthode d'agrégat : la règle croise trois
 * agrégats — le dossier de conformité du représentant, la société, ses pièces —
 * et n'appartient donc naturellement à aucun (§9).
 */
export function aptitudeDeLaSociete(etat: {
  kycDuRepresentantValide: boolean;
  societeImmatriculee: boolean;
  dossier: DossierDePieces;
  beneficiaires: readonly string[];
  maintenant?: Date;
}): AptitudeDuProfil {
  const maintenant = etat.maintenant ?? new Date();
  const motifs: MotifInaptitude[] = [];

  if (!etat.kycDuRepresentantValide) {
    motifs.push({
      code: 'KYC_INCOMPLET',
      libelle:
        "L'identité du représentant légal n'est pas vérifiée : une société ne signe pas elle-même.",
    });
  }

  if (!etat.societeImmatriculee) {
    motifs.push({
      code: 'SOCIETE_NON_IMMATRICULEE',
      libelle: "Le SIREN de la société n'est pas renseigné.",
    });
  }

  // Nommés à part : sans bénéficiaire déclaré, le dossier ne réclame aucune
  // pièce d'identité et passerait pour complet alors qu'il ne l'est pas.
  if (etat.beneficiaires.length === 0) {
    motifs.push({
      code: 'BENEFICIAIRES_NON_DECLARES',
      libelle:
        'Aucun bénéficiaire effectif (≥ 25 %) n’est déclaré pour cette société.',
    });
  }

  const manquantes = etat.dossier.piecesManquantes(
    etat.beneficiaires,
    maintenant,
  );
  if (manquantes.length > 0) {
    motifs.push({
      code: 'PIECES_MANQUANTES',
      libelle: `Justificatifs à fournir : ${[
        ...new Set(manquantes.map((m) => LIBELLE_PIECE[m.type])),
      ].join(', ')}.`,
    });
  }

  return motifs.length === 0 ? APTE : { peutOperer: false, motifs };
}
