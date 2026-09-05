import type { ExecutionContext } from '@nestjs/common';

/**
 * Déclaration des paliers de limitation de débit : valeurs des filets globaux
 * (`short`, `medium`) et règle d'application du palier `auth`.
 *
 * ─── Pourquoi ce fichier existe (constat de charge, passe 4) ────────────────
 *
 * Le palier `auth` (500 requêtes / 15 min par IP, verrou de 15 min au
 * dépassement) était déclaré GLOBALEMENT : il s'appliquait donc à toutes les
 * routes, la vitrine publique comprise. Mesuré sous Artillery : 97,8 % de 429
 * à partir de 34 requêtes/s de trafic ANONYME. Conséquence en production :
 * Googlebot, un NAT d'entreprise ou un simple pic de visite se voient refuser
 * l'accès pendant un quart d'heure — une limite pensée contre le bourrage
 * d'identifiants appliquée au catalogue public.
 *
 * `@nestjs/throttler` n'offre pas de « palier facultatif » : le guard
 * n'évalue QUE les throttlers déclarés dans le module (vérifié dans
 * throttler.guard.js 6.5.0, `onModuleInit` + `canActivate`). Supprimer
 * purement et simplement `auth` de la déclaration ne l'aurait donc pas rendu
 * « posable à la main » : cela aurait rendu MUETS tous les
 * `@Throttle({ auth: … })` de sign-in, OTP, reset et MFA — c'est-à-dire
 * supprimer la protection anti-bourrage au lieu de la cibler.
 *
 * Le palier reste donc déclaré, mais devient OPT-IN via le `skipIf` par
 * throttler que la bibliothèque prévoit : il n'est évalué que sur les routes
 * qui l'ont explicitement posé. Effet net identique à un retrait de la
 * déclaration globale (plus aucun budget `auth` consommé par le trafic
 * anonyme, ni aucun aller-retour Redis pour lui), sans perdre les paliers
 * resserrés.
 */

/**
 * Clés de métadonnée posées par `@Throttle({ auth: … })`. Elles sont
 * construites par la bibliothèque comme `THROTTLER:LIMIT<nom>` /
 * `THROTTLER:TTL<nom>` (throttler.constants.js) ; le guard lit exactement
 * celles-ci sur le handler puis sur la classe.
 */
const METADATA_LIMITE_AUTH = 'THROTTLER:LIMITauth';
const METADATA_TTL_AUTH = 'THROTTLER:TTLauth';

/** Fenêtre du palier `auth` par défaut : 15 minutes. */
export const PALIER_AUTH_TTL_MS = 900_000;

/** Valeurs des filets globaux avant toute configuration d'environnement. */
export const PALIERS_GLOBAUX_DEFAUT = {
  shortTtlMs: 1_000,
  shortLimit: 500,
  mediumTtlMs: 60_000,
  mediumLimit: 2_000,
} as const;

/**
 * Lit un entier strictement positif dans l'environnement, sinon la valeur par
 * défaut. Une valeur présente mais invalide FAIT ÉCHOUER LE DÉMARRAGE : une
 * limite de débit silencieusement retombée sur son défaut est exactement le
 * genre de configuration qu'on croit appliquée et qui ne l'est pas.
 */
export function lireEntierPositif(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined || brut.trim() === '') return defaut;
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur <= 0) {
    throw new Error(
      `${nom} doit être un entier strictement positif (reçu « ${brut} »).`,
    );
  }
  return valeur;
}

/**
 * Vrai si la route (handler ou contrôleur) a explicitement posé un palier
 * `auth`. Même ordre de résolution que le guard : handler d'abord, classe
 * ensuite.
 */
export function palierAuthPoseExplicitement(
  context: ExecutionContext,
): boolean {
  const cibles: unknown[] = [context.getHandler?.(), context.getClass?.()];
  return cibles.some(
    (cible) =>
      typeof cible === 'function' &&
      (Reflect.getMetadata(METADATA_LIMITE_AUTH, cible) !== undefined ||
        Reflect.getMetadata(METADATA_TTL_AUTH, cible) !== undefined),
  );
}

/**
 * `skipIf` du palier `auth` : on saute partout SAUF là où la route s'est
 * déclarée sensible au bourrage d'identifiants.
 */
export function sauterPalierAuth(context: ExecutionContext): boolean {
  return !palierAuthPoseExplicitement(context);
}
