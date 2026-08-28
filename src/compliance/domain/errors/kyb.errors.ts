import { ComplianceError, ComplianceErrorKind } from './compliance.error';
import { StatutKyb } from '../enums/statut-kyb.enum';

/**
 * Un geste du parcours KYB a été demandé sur le dossier d'une personne
 * physique.
 *
 * Une personne physique n'a pas de KYB : son identité se vérifie par
 * `KycCase`, et c'est précisément ce que le cahier des charges veut ne pas
 * faire ressaisir par société. Le dossier d'une société, lui, n'a pas de KYC —
 * une société n'a pas d'identité à vérifier, elle a un représentant qui signe
 * pour elle.
 *
 * L'invariant est donc symétrique, et il n'était porté nulle part : la racine
 * est clé sur le souscripteur (`ProfilInvestisseur`), mais rien n'empêchait
 * jusqu'ici d'écrire un état de société sur la ligne d'un titulaire.
 */
export class KybNeConcernePasUnePersonnePhysiqueError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor() {
    super(
      "Ce dossier est celui d'une personne physique : sa conformité s'établit par la vérification d'identité, pas par un dossier KYB.",
      { code: 'KYB_HORS_SUJET_POUR_UNE_PERSONNE_PHYSIQUE' },
    );
  }
}

/**
 * Une décision manuelle a été prise sur un dossier KYB qui n'est pas en
 * instruction.
 *
 * C'est l'exact pendant de {@link KycPasEnRevueManuelleError}, et il protège la
 * même chose : un dossier ne peut être validé que si l'équipe conformité a eu
 * quelque chose à lire. Sans cette règle, un dossier `EN_CONSTITUTION` — donc
 * à qui il manque un KBIS, des statuts ou la pièce d'identité d'un bénéficiaire
 * — pourrait être validé d'un appel, ce qui suffit à ouvrir dépôts,
 * souscriptions et retraits au nom de la société.
 *
 * La remise en constitution, elle, reste légale depuis n'importe quel état :
 * une pièce peut être refusée à tout moment, y compris après validation, et
 * c'est ainsi qu'un KYB validé se révoque.
 */
export class KybPasEnInstructionError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor(statutActuel: StatutKyb) {
    super(
      `Ce dossier KYB n'est pas en instruction (statut actuel : ${statutActuel}). Seul un dossier réunissant toutes ses pièces peut faire l'objet d'une décision de conformité.`,
      {
        code: 'KYB_PAS_EN_INSTRUCTION',
        details: { statutActuel },
      },
    );
  }
}
