/**
 * Port de LECTURE de la pièce d'identité déjà vérifiée au KYC (ISP : une
 * méthode, lecture seule), destinée au compte Stripe Connect de retrait.
 *
 * POURQUOI. Sans ce pont, Stripe redemande la pièce d'identité à
 * l'investisseur dès que son compte de retrait franchit un seuil de volume
 * (« Actions requises : fournir une pièce d'identité » — constaté sur un
 * compte à 3 225 € reçus), alors que la plateforme détient déjà le document,
 * vérifié par Stripe Identity. Attachée À LA CRÉATION du compte, la pièce
 * pré-satisfait l'exigence : elle ne figure plus ni dans le dû actuel ni
 * dans le dû futur (vérifié en test), et l'investisseur n'a plus jamais
 * cette démarche à faire.
 *
 * FENÊTRE D'ACTION — vérifiée contre l'API réelle : la plateforme peut poser
 * `individual.verification.document` à la création et tant que le titulaire
 * n'a pas terminé son onboarding Express ; après, Stripe refuse (« does not
 * have the required permissions for the parameter 'individual' »). Ce port
 * n'a donc de sens qu'appelé au moment de la création du compte.
 *
 * Le port renvoie des OCTETS, pas des identifiants de fichiers Stripe : un
 * fichier collecté par Stripe Identity appartient à la plateforme et ne peut
 * pas être référencé tel quel par un compte connecté — il doit être re-téléversé
 * dans le périmètre du compte. La provenance (Identity, stockage interne…)
 * reste ainsi le seul savoir de l'adaptateur.
 */

export interface KycDocumentFace {
  data: Buffer;
  /** Type MIME réel du fichier (image/jpeg, image/png, application/pdf). */
  mimeType: string;
  /** Nom de fichier transmis à Stripe (information, pas identifiant). */
  filename: string;
}

export interface KycIdentityDocument {
  front: KycDocumentFace;
  /** Absent pour les documents à face unique (passeport). */
  back: KycDocumentFace | null;
}

export abstract class KycDocumentSource {
  /**
   * Pièce d'identité vérifiée de l'utilisateur, ou `null` si aucune n'est
   * disponible (KYC absent, fichiers inaccessibles…). `null` n'est jamais une
   * erreur : l'appelant crée alors le compte comme avant, et Stripe collecte
   * le document lui-même le moment venu.
   */
  abstract findByUserId(userId: number): Promise<KycIdentityDocument | null>;
}
