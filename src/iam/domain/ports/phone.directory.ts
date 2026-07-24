export const PHONE_DIRECTORY = Symbol('PHONE_DIRECTORY');

/**
 * « Sur quel numéro puis-je joindre ce compte ? »
 *
 * IAM a besoin de la réponse pour envoyer un code d'inscription par SMS, mais
 * ne veut rien savoir de l'endroit où le numéro est saisi ni de sa forme de
 * stockage. L'adapter qui l'implémente est le seul point de contact avec le
 * contexte qui détient la donnée.
 */
export interface PhoneDirectory {
  /** Le numéro connu pour ce compte, ou null s'il n'y en a pas. */
  findPhone(accountId: number): Promise<string | null>;
}
