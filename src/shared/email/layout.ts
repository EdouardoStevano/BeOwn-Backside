import Handlebars from 'handlebars';

/**
 * Layout HTML fixe des emails BeOwn.
 *
 * Le header (logo/nom) et le footer (mention légale) ont été extraits UNE
 * FOIS des templates .hbs historiques (src/shared/email/templates/*.hbs).
 * Les corps stockés en base (email_templates.corps_html) ne contiennent QUE
 * le contenu métier : au rendu (EmailTemplateService.render), ils sont
 * injectés entre ces deux blocs. Un admin qui édite un template ne peut donc
 * pas casser la charte (couleurs, logo, mention légale).
 *
 * Les templates .hbs du code conservent leur propre layout complet : ils ne
 * servent que de fallback rendu tel quel quand la clé n'existe pas en base.
 */

/**
 * Feuille de style « union » des classes utilisées par les corps historiques.
 * Pour les classes dont la déclaration varie selon le template d'origine
 * (.h1/.p centrés ou non, .badge/.btn colorés différemment…), la variante du
 * template source est inlinée sur les éléments au moment du seed (voir
 * email-template.service.ts) — la valeur ci-dessous n'est que le défaut,
 * utile aux contenus rédigés par un admin.
 */
export const LAYOUT_STYLE_MAP: Record<string, string> = {
  wrap: 'max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07)',
  header: 'background:#1A2E35;padding:32px 40px;text-align:center',
  logo: 'color:#FFB52E;font-size:26px;font-weight:800;letter-spacing:-0.5px',
  body: 'padding:40px',
  h1: 'font-size:22px;font-weight:700;color:#1A2E35;margin:0 0 12px',
  p: 'font-size:15px;color:#64748b;line-height:1.6;margin:0 0 20px',
  otp: 'background:#f8fafc;border:2px dashed #e2e8f0;border-radius:12px;padding:24px;text-align:center;font-size:36px;font-weight:800;letter-spacing:8px;color:#1A2E35;margin-bottom:24px',
  note: 'font-size:13px;color:#94a3b8;text-align:center',
  badge:
    'background:#dcfce7;border-radius:50%;width:64px;height:64px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px',
  tag: 'display:inline-block;background:#FFB52E;color:#1A2E35;font-size:12px;font-weight:700;padding:4px 12px;border-radius:100px;margin-bottom:16px',
  location: 'font-size:14px;color:#94a3b8;margin-bottom:20px',
  motif:
    'background:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;font-size:14px;color:#dc2626',
  card: 'background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px',
  row: 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9',
  label: 'font-size:13px;color:#64748b',
  value: 'font-size:14px;font-weight:700;color:#1A2E35',
  amount:
    'background:#1A2E35;color:#fff;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px',
  'amount-label': 'font-size:12px;opacity:.6;margin-bottom:6px',
  'amount-value': 'font-size:32px;font-weight:800;color:#FFB52E',
  btn: 'display:block;width:fit-content;margin:0 auto;background:#FFB52E;color:#1A2E35;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none',
  footer:
    'background:#f8fafc;padding:20px 40px;text-align:center;font-size:12px;color:#94a3b8',
};

const LAYOUT_BODY_STYLE =
  "margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

function buildLayoutStylesheet(): string {
  const classRules = Object.entries(LAYOUT_STYLE_MAP)
    .map(([cls, decl]) => `.${cls}{${decl}}`)
    .join('');
  return `body{${LAYOUT_BODY_STYLE}}${classRules}.row:last-child{border:none}`;
}

export const EMAIL_HEADER_HTML =
  '<div class="header"><div class="logo">BeOwn</div></div>';

/**
 * Base des liens légaux du pied de page. Lue à l'import comme les autres
 * constantes d'environnement du repo (cf. aml-monitor.service.ts) : le layout
 * est un module pur, sans conteneur d'injection.
 */
const FRONTEND_URL = (
  process.env.FRONTEND_URL ?? 'https://beown.fr'
).replace(/\/+$/, '');

/**
 * Identité de l'émetteur — OBLIGATOIRE dans toute communication commerciale ou
 * contractuelle (art. R.123-237 C. com. pour l'immatriculation, art. 6-III LCEN
 * pour l'identification en ligne, art. 13 RGPD pour l'information du
 * destinataire sur le responsable de traitement).
 *
 * Les valeurs sont volontairement laissées en marqueurs `[À COMPLÉTER : …]` :
 * inventer une dénomination, un siège ou un numéro d'immatriculation serait
 * une mention légale FAUSSE — plus grave que son absence. Le marqueur est
 * visible dans chaque e-mail de test, ce qui rend l'oubli impossible à
 * manquer avant la mise en production. Ne pas retirer ces marqueurs sans les
 * remplacer par les données réelles du Kbis.
 */
export const EMAIL_LEGAL_IDENTITY_HTML =
  '[À COMPLÉTER : dénomination sociale] — [À COMPLÉTER : forme juridique et capital social]<br>' +
  'Siège social : [À COMPLÉTER : adresse complète du siège social]<br>' +
  'Immatriculation : [À COMPLÉTER : RCS et numéro SIREN] — ' +
  'TVA : [À COMPLÉTER : numéro de TVA intracommunautaire]';

/**
 * Pied de page commun à TOUS les e-mails rendus depuis un template éditable en
 * back-office : identité de l'émetteur + accès aux mentions légales et à la
 * politique de confidentialité. Un administrateur qui édite le corps d'un
 * template ne peut donc pas supprimer ces mentions — c'est précisément la
 * raison d'être du layout fixe.
 *
 * Le lien de DÉSINSCRIPTION ne figure pas ici : il ne concerne que les
 * diffusions (art. L.34-5 CPCE), pas les e-mails transactionnels qu'un
 * utilisateur ne peut pas refuser sans perdre l'information sur son propre
 * argent. Il est porté par le corps des templates de diffusion, via la
 * variable `{{unsubscribeUrl}}` — voir `templates/new-project.hbs`,
 * `templates/ouverture-reservation.hbs` et `templates/new-secondary.hbs`.
 */
export const EMAIL_FOOTER_HTML =
  '<div class="footer">' +
  `<div style="margin-bottom:8px">${EMAIL_LEGAL_IDENTITY_HTML}</div>` +
  '<div>' +
  `<a href="${FRONTEND_URL}/legal" style="color:#64748b">Mentions légales</a>` +
  ' &middot; ' +
  `<a href="${FRONTEND_URL}/privacy" style="color:#64748b">Politique de confidentialité</a>` +
  '</div>' +
  '<div style="margin-top:8px">© BeOwn — Investissement immobilier fractionné</div>' +
  '</div>';

/**
 * Enveloppe un corps d'email (HTML déjà rendu) dans le layout BeOwn complet :
 * document HTML, feuille de style, header logo et footer légal.
 */
export function wrapInLayout(corpsHtml: string, title = 'BeOwn'): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${Handlebars.escapeExpression(title)}</title>
<style>${buildLayoutStylesheet()}</style></head>
<body><div class="wrap">
  ${EMAIL_HEADER_HTML}
  <div class="body">
${corpsHtml}
  </div>
  ${EMAIL_FOOTER_HTML}
</div></body></html>`;
}
