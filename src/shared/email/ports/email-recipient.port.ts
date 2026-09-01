/**
 * PORT (DIP) — de qui parle-t-on quand on veut envoyer un e-mail à un
 * utilisateur identifié par son `userId` ?
 *
 * Les chemins qui déclenchent un e-mail transactionnel (webhook Stripe,
 * exécution d'une distribution, décision KYC) connaissent un `userId`, jamais
 * une adresse. Sans cette abstraction, chacun d'eux devrait injecter le
 * référentiel utilisateurs et refaire, à sa façon, la lecture de l'adresse, du
 * prénom et des préférences — trois occasions de diverger sur la règle
 * d'opt-out.
 *
 * Interface volontairement minuscule (ISP) : une seule question, une seule
 * réponse. Elle n'expose ni le modèle `User`, ni les préférences complètes —
 * l'expéditeur n'a aucun besoin d'en savoir plus, et ne peut donc rien en
 * faire d'autre.
 *
 * `abstract class` (et non `interface` TS) pour servir à la fois d'abstraction
 * et de token d'injection Nest, comme `MetricsPort` ou `ConnectAccountReader`.
 */
export interface EmailRecipient {
  /** Adresse de destination. Un utilisateur sans adresse n'est pas joignable. */
  email: string;
  /** Prénom d'adresse, jamais vide (repli neutre côté adaptateur). */
  prenom: string;
  /**
   * Le canal e-mail est-il actif dans les préférences de l'utilisateur
   * (`user_preferences.notifEmail`) ? Un `false` explicite doit faire renoncer
   * à l'envoi : c'est un choix exprimé, pas un défaut.
   */
  accepteEmail: boolean;
}

export abstract class EmailRecipientReader {
  /** `null` si l'utilisateur n'existe plus ou n'a aucune adresse connue. */
  abstract findByUserId(userId: number): Promise<EmailRecipient | null>;
}
