import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';

export const NATURE_DU_DOSSIER_REPOSITORY = Symbol(
  'NATURE_DU_DOSSIER_REPOSITORY',
);

/**
 * Le registre des natures : quel compte relève de quel régime de vérification.
 *
 * Une seule opération, et elle n'est pas un `save` — `declarer` **pose la
 * nature si le compte n'en a pas encore, et rend dans tous les cas celle qui
 * fait foi**. L'appelant compare ce qu'il voulait à ce qu'il obtient : s'ils
 * diffèrent, un dossier de l'autre nature existe déjà, et c'est à lui de lever
 * l'erreur métier (§14 — la décision reste au use case, le port ne fait que
 * constater).
 *
 * Ce contrat en une passe plutôt qu'un `lire` suivi d'un `ecrire` n'est pas de
 * la commodité : c'est ce qui rend la règle imperméable à la course. Deux
 * requêtes simultanées — l'une créant un dossier physique, l'autre un dossier
 * moral — liraient toutes deux « ce compte n'a rien déclaré » et
 * s'autoriseraient mutuellement. Ici, la seconde se heurte à la ligne écrite
 * par la première et reçoit sa nature, pas la sienne.
 */
export interface NatureDuDossierRepository {
  /**
   * @returns la nature qui fait foi pour ce compte — celle qu'on vient
   * d'inscrire, ou celle qui y était déjà.
   */
  declarer(userId: number, nature: NatureDeDossier): Promise<NatureDeDossier>;
}
