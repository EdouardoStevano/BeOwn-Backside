/**
 * Ce qu'un compte est, du point de vue du dossier de conformité : une personne
 * physique, ou une personne morale.
 *
 * Le choix est **exclusif et définitif** : un titulaire qui investit en son nom
 * propre et un titulaire qui investit par une société ne relèvent pas du même
 * dossier réglementaire — KYC d'un côté (pièce d'identité, PEP), KYB de l'autre
 * (Kbis, statuts, bénéficiaires effectifs >25 %). Laisser les deux coexister
 * sur un compte rendrait indécidable ce qu'on doit vérifier de lui, et sous
 * quel régime il souscrit.
 *
 * L'exclusivité s'arrête là : une personne morale peut en cacher plusieurs —
 * un même dirigeant gère souvent plusieurs sociétés d'investissement — et rien
 * n'interdit à un compte PM de porter plusieurs dossiers de sociétés.
 *
 * Distinct de `UserType` (contexte `identity`), qui enregistre ce que le
 * titulaire a **annoncé** à l'ouverture de son compte. Ici, c'est ce que son
 * dossier **est** devenu en existant. Les deux coïncident en pratique, mais
 * l'un est une intention révocable tant que rien n'est rempli, l'autre un fait
 * que la conformité oppose.
 */
export enum NatureDeDossier {
  PP = 'PP',
  PM = 'PM',
}
