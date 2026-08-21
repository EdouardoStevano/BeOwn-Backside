/**
 * **Le projet, vu par la file de réservation** — et rien de plus.
 *
 * `reservation` ne connaît pas l'agrégat `Project` de `catalog` (§3.2 :
 * deux contextes ne partagent pas leurs entités). Il reçoit cette vue,
 * traduite par la couche application (`ProjetReservableTranslator`, §13) à
 * partir des faits que `catalog` publie en amont (§3.4, Customer/Supplier) :
 * cinq champs, exactement ce dont les règles RG-RES ont besoin.
 *
 * Deux booléens distincts plutôt qu'un `ouvert` combiné : « le projet n'est
 * pas dans la fenêtre ANNONCÉ » et « le porteur n'a pas activé le
 * pré-investissement » sont deux refus différents, avec deux messages
 * différents pour l'investisseur.
 */
export interface ProjetReservable {
  projetId: string;
  /** Le projet est dans la fenêtre ANNONCÉ → PUBLIÉ, celle du pré-investissement. */
  enPhaseAnnonce: boolean;
  /** Le porteur a activé le pré-investissement sur ce projet. */
  preInvestissementActive: boolean;
  ticketMinimum: number;
  ticketMaximum: number | null;
  /** RG-RES-05. `null` = pas de plafond configuré. */
  plafondPreInvestissement: number | null;
}
