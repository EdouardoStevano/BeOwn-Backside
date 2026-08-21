/**
 * Décide si les endpoints de test (`POST /test/email`, `POST /test/sms`) sont
 * exposés.
 *
 * Ces routes sont `@Public()` — donc joignables sans authentification — et
 * déclenchent un envoi réel d'e-mail et de SMS (coût, réputation d'expéditeur,
 * canal d'abus). Le seul verrou existant était l'opt-in `ENABLE_TEST_ENDPOINTS`,
 * qui suffit tant que personne ne le positionne par erreur dans un fichier
 * d'environnement partagé ou un ConfigMap recopié.
 *
 * On ajoute donc un verrou d'ENVIRONNEMENT non contournable par cette variable :
 * en `production` comme en `staging`, les endpoints restent fermés même si
 * `ENABLE_TEST_ENDPOINTS=true`. Les deux conditions doivent être réunies.
 *
 * Fonction pure et paramétrée par l'environnement : testable sans manipuler
 * `process.env` globalement.
 */
export const PROTECTED_ENVIRONMENTS = ['production', 'staging'] as const;

export function areTestEndpointsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.ENABLE_TEST_ENDPOINTS !== 'true') return false;

  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  return !PROTECTED_ENVIRONMENTS.includes(
    nodeEnv as (typeof PROTECTED_ENVIRONMENTS)[number],
  );
}
