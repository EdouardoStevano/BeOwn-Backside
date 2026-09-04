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
 * On ajoute donc un verrou d'ENVIRONNEMENT non contournable par cette variable.
 * Ce verrou est une LISTE BLANCHE, et non une liste noire de deux
 * environnements « protégés » : la liste noire ne fermait que `production` et
 * `staging`, si bien qu'un `NODE_ENV` absent, mal orthographié (`prod`,
 * `Production ` avec une espace de trop dans un ConfigMap) ou nommé autrement
 * (`preprod`, `recette`) rouvrait des routes publiques qui envoient de vrais
 * e-mails et de vrais SMS. La question à laquelle il faut répondre n'est pas
 * « suis-je dans un environnement dangereux ? » — on ne peut pas les énumérer
 * tous — mais « suis-je dans un environnement où c'est explicitement prévu ? ».
 *
 * Les deux conditions doivent être réunies : opt-in `ENABLE_TEST_ENDPOINTS` ET
 * environnement de la liste blanche.
 *
 * Fonction pure et paramétrée par l'environnement : testable sans manipuler
 * `process.env` globalement.
 */
export const TEST_ENDPOINTS_ALLOWED_ENVIRONMENTS = [
  'development',
  'test',
  'local',
] as const;

export function areTestEndpointsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.ENABLE_TEST_ENDPOINTS !== 'true') return false;

  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  return TEST_ENDPOINTS_ALLOWED_ENVIRONMENTS.includes(
    nodeEnv as (typeof TEST_ENDPOINTS_ALLOWED_ENVIRONMENTS)[number],
  );
}
