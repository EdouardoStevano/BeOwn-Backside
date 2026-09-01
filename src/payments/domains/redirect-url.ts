/**
 * Validation des URL de redirection confiées à un prestataire externe.
 *
 * POURQUOI CE FICHIER EXISTE — `POST /payments/connect/onboarding-link` accepte
 * `returnUrl` et `refreshUrl` dans le corps de la requête et les transmet tels
 * quels à `accountLinks.create`. Stripe s'engage alors à renvoyer
 * l'investisseur sur cette adresse À LA SORTIE de l'onboarding bancaire —
 * c'est-à-dire à l'instant précis où il vient de saisir ses coordonnées de
 * versement et où il s'attend à revenir chez BeOwn.
 *
 * Une adresse arbitraire y déposerait la victime sur une page tierce, chargée
 * par un lien portant le sceau de Stripe, dans le contexte mental le plus
 * favorable qui soit à une demande de « confirmation » de RIB. Le redirecteur
 * ouvert n'est pas ici une coquetterie de conformité : c'est l'amorce d'un
 * hameçonnage sur le chemin de l'argent.
 *
 * La règle retenue est l'ALLOWLIST D'ORIGINES, la même liste que celle qui
 * gouverne déjà CORS (`FRONTEND_URL`, `ADMIN_URL`). Pas de liste noire, pas de
 * détection de motif : seule une origine explicitement déclarée par
 * l'exploitant est acceptée. Tout le reste est refusé, y compris ce qui « a
 * l'air » interne.
 *
 * Fonction PURE — aucun accès réseau, aucune dépendance framework : la règle se
 * teste seule, et c'est la couche présentation qui lui fournit la liste.
 */

/** Schémas acceptés. `javascript:`, `data:` et consorts sont hors-jeu. */
const SCHEMAS_AUTORISES = new Set(['http:', 'https:']);

/**
 * Normalise une origine déclarée en configuration (`https://app.beown.fr/`,
 * `https://app.beown.fr`) vers sa forme canonique `protocole//hôte[:port]`.
 *
 * @returns l'origine canonique, ou `null` si la valeur n'est pas une URL
 *          absolue exploitable — une entrée de configuration erronée ne doit
 *          jamais élargir l'allowlist par accident.
 */
export function normaliserOrigine(valeur: string | undefined | null): string | null {
  if (!valeur) return null;
  try {
    const url = new URL(valeur.trim());
    if (!SCHEMAS_AUTORISES.has(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Vrai si `candidate` est une URL absolue dont l'origine figure dans
 * `originesAutorisees`.
 *
 * La comparaison porte sur l'ORIGINE COMPLÈTE (schéma + hôte + port), jamais
 * sur un préfixe de chaîne : `https://app.beown.fr.evil.com` et
 * `http://app.beown.fr` (schéma dégradé) sont l'un comme l'autre refusés, alors
 * qu'un `startsWith` les aurait laissés passer. Le chemin, la requête et le
 * fragment restent libres : ils ne changent pas la destination.
 */
export function estRedirectionAutorisee(
  candidate: string | undefined | null,
  originesAutorisees: readonly string[],
): boolean {
  const origineCandidate = normaliserOrigine(candidate);
  if (!origineCandidate) return false;

  const autorisees = new Set(
    originesAutorisees
      .map((origine) => normaliserOrigine(origine))
      .filter((origine): origine is string => origine !== null),
  );
  return autorisees.has(origineCandidate);
}

/**
 * Résout l'URL de redirection à transmettre au prestataire.
 *
 * SÉMANTIQUE VOLONTAIRE — une valeur absente retombe sur le défaut, une valeur
 * REFUSÉE aussi. On ne lève pas : l'appelant légitime est le front BeOwn, qui
 * n'a aucune raison d'envoyer une origine étrangère ; une requête forgée n'a,
 * elle, pas à être renseignée sur ce qui a été filtré. Le refus est journalisé
 * par l'appelant, jamais restitué au client.
 *
 * @param demandee    valeur reçue du client (peut être absente)
 * @param defaut      URL de repli, construite par le serveur
 * @param originesAutorisees allowlist d'origines de l'exploitant
 */
export function resoudreUrlRedirection(
  demandee: string | undefined | null,
  defaut: string,
  originesAutorisees: readonly string[],
): { url: string; refusee: boolean } {
  if (!demandee) return { url: defaut, refusee: false };
  if (estRedirectionAutorisee(demandee, originesAutorisees)) {
    return { url: demandee, refusee: false };
  }
  return { url: defaut, refusee: true };
}
