/**
 * Version courante des CGU publiées — SOURCE DE VÉRITÉ SERVEUR.
 *
 * La version stockée à l'inscription (`users.cguVersionAcceptee`) est une
 * PREUVE de consentement, opposable au titre de l'art. 7.1 RGPD. Elle venait
 * du corps de requête, donc du client : un appelant pouvait déclarer avoir
 * accepté n'importe quelle version — « 99.0 », « 0.1 », ou la version d'un
 * texte qui n'a jamais existé — et la plateforme l'archivait telle quelle. Une
 * preuve que la partie intéressée rédige elle-même n'en est pas une.
 *
 * Le serveur décide donc, et le front n'est plus qu'un afficheur. Le champ
 * `cguVersion` du corps reste accepté comme CONTRÔLE DE COHÉRENCE : une
 * divergence signale que le texte affiché n'était pas celui en vigueur —
 * information utile, journalisée, mais qui ne justifie pas de refuser une
 * inscription (les fronts déployés se mettent à jour à leur rythme).
 *
 * MIROIR : « BeOwn - Frontside/src/core/config/cguVersion.ts » doit rester en
 * phase. À incrémenter UNIQUEMENT lors d'une révision réelle du texte publié.
 */
export const CGU_VERSION_PAR_DEFAUT = '1.1';

/**
 * Résout la version en vigueur. Surchargeable par `CGU_VERSION_COURANTE` pour
 * qu'une publication de CGU ne dépende pas d'un déploiement de code — une
 * valeur vide ou absente retombe sur la constante, jamais sur une chaîne vide
 * (une version non identifiable ne vaut pas mieux qu'une version absente).
 */
export const versionCguCourante = (
  env: NodeJS.ProcessEnv = process.env,
): string => env.CGU_VERSION_COURANTE?.trim() || CGU_VERSION_PAR_DEFAUT;
