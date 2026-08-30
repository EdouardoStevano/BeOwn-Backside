import { DossierDePieces } from '../aggregates/dossier-de-pieces';
import {
  LIBELLE_PIECE,
  TypePieceJustificative,
} from '../enums/type-piece-justificative.enum';
import { StatutKyb } from '../enums/statut-kyb.enum';

/**
 * Ce qui empêche un profil d'agir, dit en clair.
 *
 * Un code stable pour le front, un libellé pour l'écran. Les deux voyagent
 * ensemble parce qu'un profil inapte sans raison affichable renvoie le
 * titulaire à deviner ce qu'il lui reste à faire.
 *
 * Les trois derniers codes disent l'état du dossier KYB, et ils sont distincts
 * parce qu'ils appellent trois gestes différents : attendre, corriger, ou
 * redéposer. Un code unique « KYB non valide » aurait laissé l'écran les
 * confondre.
 */
export interface MotifInaptitude {
  code:
    | 'KYC_INCOMPLET'
    | 'PROFIL_NON_RENSEIGNE'
    | 'SOCIETE_NON_IMMATRICULEE'
    | 'BENEFICIAIRES_NON_DECLARES'
    | 'PIECES_MANQUANTES'
    | 'KYB_EN_INSTRUCTION'
    | 'KYB_REFUSE'
    | 'KYB_EXPIRE';
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
 * @param peutOperer verdict de `DossierDEntreeEnRelation.peutOperer()`, passé
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
 * Deux conditions cumulatives, et la première est celle qu'on oublie : une
 * personne morale ne signe pas, c'est une personne physique qui signe pour
 * elle. Le représentant légal doit donc être identifié — son KYC vaut pour
 * toutes ses sociétés, et c'est précisément ce que le cahier des charges
 * cherche à éviter de ressaisir.
 *
 * | Condition                  | D'où elle vient                            |
 * | -------------------------- | ------------------------------------------ |
 * | KYC du représentant validé | `DossierDEntreeEnRelation.peutOperer` (PP) |
 * | KYB de la société valide   | `DossierDEntreeEnRelation.peutOperer` (PM) |
 *
 * **Ce service ne décide plus de la complétude du dossier, il l'explique.**
 * Il composait auparavant le verdict lui-même — immatriculation, bénéficiaires,
 * pièces manquantes — c'est-à-dire qu'il le *recalculait à chaque lecture*. Un
 * verdict recalculé bascule silencieusement : le jour où un KBIS se périme ou
 * qu'un bénéficiaire est déclaré de plus, la société cessait de pouvoir opérer
 * sans qu'aucune décision ait été prise, sans date et sans auteur — rien
 * d'opposable au régulateur. Ces trois lectures ont désormais leur place en
 * amont, dans l'instruction qui aboutit à {@link DecisionKyb} ; ici elles ne
 * servent plus qu'à dire au titulaire ce qu'il lui reste à faire.
 *
 * Les motifs ne sont donc composés **que lorsque le verdict est négatif** :
 * c'est le contrat qu'`EligibiliteDuTitulaire` annonce déjà (« vide sinon »), et
 * le seul moyen d'éviter qu'une société apte se voie reprocher une pièce que
 * l'instruction avait acceptée.
 *
 * La complétude des pièces recouvre la déclaration des bénéficiaires : sans
 * eux, aucune pièce d'identité n'est réclamée et le dossier passerait pour
 * complet à tort. Le motif les nomme donc séparément, pour que l'écran envoie
 * le titulaire au bon formulaire.
 *
 * **Un Domain Service**, et non une méthode d'agrégat : la règle croise deux
 * racines — le dossier de conformité du représentant et celui de la société —
 * qui sont deux frontières transactionnelles (§17), et n'appartient donc
 * naturellement à aucune (§9).
 *
 * @param kybValide verdict de `DossierDEntreeEnRelation.peutOperer()` sur la
 *   ligne de la société. Un booléen et non la racine : ce service n'a pas à
 *   connaître un agrégat pour en relire un verdict (§9).
 * @param statutKyb sert **uniquement** à nommer le motif — attendre, corriger
 *   ou redéposer ne sont pas le même geste. Il ne décide rien : l'échéance de
 *   validité n'est lisible que sur la décision, et c'est `kybValide` qui la
 *   porte.
 */
export function aptitudeDeLaSociete(etat: {
  kycDuRepresentantValide: boolean;
  kybValide: boolean;
  statutKyb: StatutKyb;
  societeImmatriculee: boolean;
  dossier: DossierDePieces;
  beneficiaires: readonly string[];
  maintenant?: Date;
}): AptitudeDuProfil {
  if (etat.kycDuRepresentantValide && etat.kybValide) return APTE;

  const maintenant = etat.maintenant ?? new Date();
  const motifs: MotifInaptitude[] = [];

  if (!etat.kycDuRepresentantValide) {
    motifs.push({
      code: 'KYC_INCOMPLET',
      libelle:
        "L'identité du représentant légal n'est pas vérifiée : une société ne signe pas elle-même.",
    });
  }

  // Ce qui reste matériellement à réunir. Trois lectures qui ne tranchent plus
  // rien : elles disent au titulaire où aller.
  const aReunir: MotifInaptitude[] = [];

  if (!etat.societeImmatriculee) {
    aReunir.push({
      code: 'SOCIETE_NON_IMMATRICULEE',
      libelle: "Le SIREN de la société n'est pas renseigné.",
    });
  }

  // Nommés à part : sans bénéficiaire déclaré, le dossier ne réclame aucune
  // pièce d'identité et passerait pour complet alors qu'il ne l'est pas.
  if (etat.beneficiaires.length === 0) {
    aReunir.push({
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
    aReunir.push({
      code: 'PIECES_MANQUANTES',
      libelle: libelleDesPiecesManquantes(manquantes),
    });
  }

  motifs.push(...aReunir);

  // Où en est l'instruction — ajouté seulement quand il n'y a rien à réunir,
  // sinon l'écran dirait « en cours d'instruction » à qui n'a pas encore déposé
  // son KBIS. Un refus, lui, se dit toujours : c'est l'information que le
  // titulaire doit voir en premier, et elle ne se déduit d'aucune autre.
  const refuse = etat.statutKyb === StatutKyb.REFUSE;
  if (!etat.kybValide && (refuse || aReunir.length === 0)) {
    motifs.push(motifDuStatutKyb(etat.statutKyb));
  }

  return { peutOperer: false, motifs };
}

/**
 * Ce qu'il reste à fournir, dit en une phrase.
 *
 * Exporté parce que **deux appelants doivent dire la même chose** : l'écran
 * d'aptitude, et le motif que `DossierDePiecesIncomplet` transporte jusqu'au
 * dossier KYB. Deux formulations écrites séparément auraient fini par diverger,
 * et le titulaire aurait lu deux listes différentes du même manque.
 *
 * Dédoublonné par type : trois bénéficiaires sans pièce d'identité font un seul
 * libellé, pas trois fois le même.
 */
export function libelleDesPiecesManquantes(
  manquantes: readonly { type: TypePieceJustificative }[],
): string {
  return `Justificatifs à fournir : ${[
    ...new Set(manquantes.map((m) => LIBELLE_PIECE[m.type])),
  ].join(', ')}.`;
}

/**
 * Ce que l'état du dossier KYB demande au titulaire de faire.
 *
 * `VALIDE` y figure parce qu'un dossier validé peut n'être plus valide : son
 * échéance est passée. C'est le seul chemin par lequel ce cas se présente ici,
 * `aptitudeDeLaSociete` n'appelant cette fonction que sur un verdict négatif.
 */
function motifDuStatutKyb(statut: StatutKyb): MotifInaptitude {
  switch (statut) {
    case StatutKyb.REFUSE:
      return {
        code: 'KYB_REFUSE',
        libelle:
          "Le dossier de la société a été rejeté par l'équipe conformité. Corrigez les pièces signalées puis redéposez-les.",
      };
    case StatutKyb.VALIDE:
      return {
        code: 'KYB_EXPIRE',
        libelle:
          'La validité du dossier de la société est arrivée à échéance : ses justificatifs doivent être redéposés.',
      };
    default:
      return {
        code: 'KYB_EN_INSTRUCTION',
        libelle:
          "Le dossier de la société est en cours d'instruction par l'équipe conformité.",
      };
  }
}
