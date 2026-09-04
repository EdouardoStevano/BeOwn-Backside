/**
 * Version des CGU en vigueur, côté SERVEUR.
 *
 * Constante et non paramètre de requête : la version acceptée est une PREUVE
 * (art. 7.1 RGPD, charge de la preuve du responsable de traitement). Si le
 * client la fournissait, il choisirait ce qu'il est réputé avoir accepté — un
 * consentement qu'on ne peut pas opposer.
 *
 * Alignée sur le texte publié (« Version 1.0 — en vigueur au 29 août 2026 »,
 * `src/core/config/cguVersion.ts` du dépôt Frontside) et sur le barème
 * `docs/conformite/2026-09-03-baremes-lot2.md` (§5). À incrémenter UNIQUEMENT
 * lors d'une révision réelle du texte.
 *
 * DETTE CONNUE, hors périmètre de ce lot : `POST /auth/sign-up` prend encore
 * la version dans le corps de la requête (`RegisterDto.cguVersion`). Cette
 * constante a vocation à devenir la source unique des deux chemins.
 */
export const CGU_VERSION_COURANTE = '1.0';
