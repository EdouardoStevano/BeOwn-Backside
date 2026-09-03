/**
 * Port de LECTURE de l'identité déjà connue de l'investisseur (ISP : une seule
 * méthode, en lecture seule).
 *
 * POURQUOI CE PORT EXISTE.
 *
 * Nom, date de naissance et adresse ont déjà été saisis puis vérifiés lors du
 * KYC. Sans ce port, le compte Stripe Connect était créé vide et Stripe les
 * redemandait un par un dans son formulaire hébergé : l'investisseur ressaisit
 * ce que la plateforme détient déjà, au pire moment — celui où il veut
 * récupérer son argent.
 *
 * Le port découple le pré-remplissage de sa PROVENANCE. Le module `payments`
 * exprime ici ce dont il a besoin ; c'est `profiles` qui, aujourd'hui, sait le
 * fournir. Si la source change (référentiel d'identité, données extraites du
 * document par Stripe Identity), seul l'adaptateur bouge.
 *
 * Ce type n'est PAS la forme attendue par Stripe : c'est le vocabulaire métier
 * de BeOwn. La traduction vers la charge utile Stripe est faite par un module
 * pur (`domains/connect-prefill.ts`), testable sans réseau.
 */

/** Identité minimale nécessaire à un pré-remplissage. Tout est optionnel :
 *  un profil incomplet doit dégrader l'expérience, jamais la bloquer. */
export interface InvestorIdentity {
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  /** ISO 3166-1 alpha-2, dans la casse où la base l'a stocké. */
  country: string | null;
  phone: string | null;
}

export abstract class InvestorIdentityReader {
  /** `null` si aucun profil personne physique n'est enregistré. */
  abstract findByUserId(userId: number): Promise<InvestorIdentity | null>;
}
