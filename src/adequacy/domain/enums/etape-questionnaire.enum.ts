/**
 * Les trois étapes du questionnaire d'adéquation, dans l'ordre où le règlement
 * les enchaîne.
 *
 * Elles existaient déjà — chacune a son Value Object, et `ResultatAdequation`
 * les enchaîne — mais **sans nom** : rien ne les désignait, si bien qu'elles
 * n'étaient ni adressables par une route, ni nommables dans une réponse. Le
 * formulaire arrivait donc d'un seul bloc, et le front n'avait aucun moyen de
 * savoir laquelle poser.
 *
 * L'enchaînement n'est pas un simple « suivant » : chaque étape peut **clore**
 * le questionnaire selon son propre résultat.
 *
 * | Étape                 | Ce qu'elle établit        | Clôt le parcours si |
 * | --------------------- | ------------------------- | ------------------- |
 * | `PRE_QUALIFICATION`   | professionnel ou non      | professionnel       |
 * | `QUALIFICATION`       | averti ou non             | averti              |
 * | `CAPACITE_DE_PERTE`   | montant conseillé         | toujours (dernière) |
 *
 * C'est ce que dit le cahier des charges : le professionnel « n'a pas besoin de
 * compléter les étapes suivantes », et « seuls les investisseurs non-avertis
 * doivent compléter l'étape suivante ».
 */
export enum EtapeQuestionnaire {
  PRE_QUALIFICATION = 'pre_qualification',
  QUALIFICATION = 'qualification',
  CAPACITE_DE_PERTE = 'capacite_de_perte',
}

/**
 * L'ordre du parcours, écrit une fois.
 *
 * Il est **déduit d'ici** partout ailleurs — avancement, étape suivante,
 * libellés — plutôt que réécrit : une quatrième étape s'insère à un seul
 * endroit, et l'oublier ailleurs devient impossible.
 */
export const ETAPES_DU_QUESTIONNAIRE: readonly EtapeQuestionnaire[] = [
  EtapeQuestionnaire.PRE_QUALIFICATION,
  EtapeQuestionnaire.QUALIFICATION,
  EtapeQuestionnaire.CAPACITE_DE_PERTE,
];

/** Libellés destinés aux messages d'erreur rendus au titulaire. */
export const LIBELLE_ETAPE: Record<EtapeQuestionnaire, string> = {
  [EtapeQuestionnaire.PRE_QUALIFICATION]: 'pré-qualification',
  [EtapeQuestionnaire.QUALIFICATION]: 'qualification',
  [EtapeQuestionnaire.CAPACITE_DE_PERTE]: 'capacité à subir des pertes',
};
