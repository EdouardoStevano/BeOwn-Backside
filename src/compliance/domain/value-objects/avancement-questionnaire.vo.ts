import {
  ETAPES_DU_QUESTIONNAIRE,
  EtapeQuestionnaire,
} from '../enums/etape-questionnaire.enum';

/** Quand chaque étape a été répondue — `null` tant qu'elle ne l'a pas été. */
export interface AvancementSnapshot {
  preQualificationRepondueLe: Date | null;
  qualificationRepondueLe: Date | null;
  capaciteRepondueLe: Date | null;
}

/** L'étape et la colonne qui date sa réponse. */
const DATE_DE: Record<EtapeQuestionnaire, keyof AvancementSnapshot> = {
  [EtapeQuestionnaire.PRE_QUALIFICATION]: 'preQualificationRepondueLe',
  [EtapeQuestionnaire.QUALIFICATION]: 'qualificationRepondueLe',
  [EtapeQuestionnaire.CAPACITE_DE_PERTE]: 'capaciteRepondueLe',
};

/**
 * Où en est le titulaire dans son questionnaire : quelles étapes il a
 * réellement répondues, et quand.
 *
 * **Sans ces trois dates, une étape répondue est indiscernable d'une étape
 * jamais ouverte.** Toutes les réponses des étapes 1 et 2 sont des booléens qui
 * valent `false` par défaut — en base comme dans leur Value Object, une réponse
 * absente valant « non ». Un titulaire qui répond « non » aux trois critères de
 * pré-qualification produit donc exactement la ligne d'un titulaire qui n'a
 * jamais vu le formulaire. Tant que le questionnaire arrivait d'un seul bloc,
 * la question ne se posait pas : il était répondu ou inexistant. Elle se pose
 * dès qu'on le découpe, et c'est le fait de l'avoir répondu — pas son contenu —
 * qui y répond.
 *
 * Les trois dates forment un bloc parce qu'elles partagent leur usage : aucune
 * ne se lit seule, c'est leur lecture **dans l'ordre du parcours** qui dit où
 * l'on en est. Elles servent aussi de trace du passage, que RG-Q-07 demande de
 * conserver dix ans — savoir *quand* chaque déclaration a été faite fait partie
 * de ce qu'on conserve.
 *
 * **Immuable** — cf. `Identite`.
 */
export class AvancementQuestionnaire {
  private constructor(private readonly etat: AvancementSnapshot) {}

  /** Aucune étape répondue — l'état d'un questionnaire qui vient de naître. */
  static vierge(): AvancementQuestionnaire {
    return new AvancementQuestionnaire({
      preQualificationRepondueLe: null,
      qualificationRepondueLe: null,
      capaciteRepondueLe: null,
    });
  }

  /**
   * Les trois étapes répondues d'un même geste.
   *
   * C'est ce que fait la route historique, qui reçoit le formulaire entier :
   * les trois étapes y sont soumises ensemble, donc datées ensemble.
   */
  static toutRepondu(le: Date): AvancementQuestionnaire {
    return new AvancementQuestionnaire({
      preQualificationRepondueLe: le,
      qualificationRepondueLe: le,
      capaciteRepondueLe: le,
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: AvancementSnapshot): AvancementQuestionnaire {
    return new AvancementQuestionnaire({
      preQualificationRepondueLe: snapshot.preQualificationRepondueLe ?? null,
      qualificationRepondueLe: snapshot.qualificationRepondueLe ?? null,
      capaciteRepondueLe: snapshot.capaciteRepondueLe ?? null,
    });
  }

  /** Cette étape vient d'être répondue — les autres ne bougent pas. */
  repondue(etape: EtapeQuestionnaire, le: Date): AvancementQuestionnaire {
    return new AvancementQuestionnaire({
      ...this.etat,
      [DATE_DE[etape]]: le,
    });
  }

  aRepondu(etape: EtapeQuestionnaire): boolean {
    return this.etat[DATE_DE[etape]] !== null;
  }

  /** Dans l'ordre du parcours, pour que le front affiche son fil d'Ariane. */
  etapesRepondues(): EtapeQuestionnaire[] {
    return ETAPES_DU_QUESTIONNAIRE.filter((etape) => this.aRepondu(etape));
  }

  toSnapshot(): AvancementSnapshot {
    return { ...this.etat };
  }
}
