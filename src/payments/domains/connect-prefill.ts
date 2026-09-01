/**
 * Traduction de l'identité BeOwn vers la charge utile `individual` attendue par
 * Stripe à la création d'un compte Connect.
 *
 * Module PUR : aucune dépendance au SDK Stripe, à TypeORM ni au réseau. Il ne
 * fait qu'une chose — décider ce qui est transmissible — et se teste donc
 * intégralement en mémoire.
 *
 * RÈGLE DIRECTRICE : ne transmettre QUE ce qui est complet et plausible.
 *
 * Un pré-remplissage n'est pas une déclaration approximative. Ces champs
 * alimentent une vérification d'identité réglementaire : une valeur partielle
 * ou mal formée est soit rejetée par Stripe — et fait alors échouer la création
 * du compte, donc le retrait —, soit acceptée telle quelle, et l'investisseur
 * se retrouve avec une adresse fausse sur un compte financier. Dans le doute,
 * on omet le champ : Stripe le redemandera, ce qui est le comportement actuel
 * et reste correct.
 *
 * L'adresse est traitée en TOUT OU RIEN. Une adresse amputée de sa ville ou de
 * son code postal n'est pas une demi-adresse utile : c'est une adresse fausse.
 */
import type { InvestorIdentity } from '../applications/ports/investor-identity.port';

/** Sous-ensemble de `Stripe.AccountCreateParams.Individual` réellement émis. */
export interface IndividualPrefill {
  first_name?: string;
  last_name?: string;
  dob?: { day: number; month: number; year: number };
  address?: {
    line1: string;
    line2?: string;
    postal_code: string;
    city: string;
    country: string;
  };
  phone?: string;
}

/** Chaîne exploitable, ou `undefined`. Les colonnes nullables contiennent en
 *  pratique aussi des chaînes vides et des espaces : les traiter comme absentes. */
const clean = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Un numéro n'est transmis qu'au format E.164 (`+` suivi de 8 à 15 chiffres).
 * Stripe rejette le reste, et un rejet ici coûterait la création du compte.
 * Les numéros au format national restent donc à saisir chez Stripe.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

const cleanPhone = (value: string | null | undefined): string | undefined => {
  const raw = clean(value);
  if (!raw) return undefined;
  // Les saisies contiennent couramment espaces, points et tirets ; ils ne
  // changent pas le numéro et leur seule présence ne doit pas le disqualifier.
  const compact = raw.replace(/[\s.\-()]/g, '');
  return E164.test(compact) ? compact : undefined;
};

/** ISO 3166-1 alpha-2 en majuscules, seule forme acceptée par Stripe. */
const cleanCountry = (value: string | null | undefined): string | undefined => {
  const raw = clean(value)?.toUpperCase();
  return raw && /^[A-Z]{2}$/.test(raw) ? raw : undefined;
};

/**
 * Date de naissance éclatée en jour/mois/année.
 *
 * Les colonnes `date` de TypeORM remontent tantôt en `Date`, tantôt en chaîne
 * `YYYY-MM-DD` selon le pilote ; les deux sont acceptées. On lit en UTC :
 * une date de naissance n'a pas d'heure, et passer par le fuseau local
 * décalerait le jour d'une unité pour les fuseaux négatifs.
 */
const cleanDob = (
  value: Date | string | null | undefined,
): IndividualPrefill['dob'] => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const year = date.getUTCFullYear();
  // Garde-fou de vraisemblance : une date hors de cette plage trahit une donnée
  // corrompue, pas un investisseur. Stripe la rejetterait de toute façon.
  if (year < 1900 || year > new Date().getUTCFullYear()) return undefined;

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year,
  };
};

/**
 * Construit le pré-remplissage, ou renvoie `undefined` s'il n'y a rien
 * d'exploitable — auquel cas l'appelant crée le compte comme avant.
 */
export function buildIndividualPrefill(
  identity: InvestorIdentity | null | undefined,
): IndividualPrefill | undefined {
  if (!identity) return undefined;

  const prefill: IndividualPrefill = {};

  const firstName = clean(identity.firstName);
  if (firstName) prefill.first_name = firstName;

  const lastName = clean(identity.lastName);
  if (lastName) prefill.last_name = lastName;

  const dob = cleanDob(identity.birthDate);
  if (dob) prefill.dob = dob;

  const phone = cleanPhone(identity.phone);
  if (phone) prefill.phone = phone;

  // Tout ou rien : les quatre composantes doivent être présentes.
  const line1 = clean(identity.addressLine1);
  const postalCode = clean(identity.postalCode);
  const city = clean(identity.city);
  const country = cleanCountry(identity.country);
  if (line1 && postalCode && city && country) {
    const line2 = clean(identity.addressLine2);
    prefill.address = {
      line1,
      ...(line2 ? { line2 } : {}),
      postal_code: postalCode,
      city,
      country,
    };
  }

  return Object.keys(prefill).length > 0 ? prefill : undefined;
}
