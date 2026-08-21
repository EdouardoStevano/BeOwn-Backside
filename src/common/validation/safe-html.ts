import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

/**
 * Contrôle du HTML riche stocké côté serveur (finding H-D / L-3).
 *
 * Les contenus d'actualités et les descriptions de projet sont écrits par un
 * back-office (éditeur Tiptap) puis rendus tels quels sur le site public via
 * `dangerouslySetInnerHTML`. Ils étaient stockés SANS aucun contrôle : un
 * compte back-office de premier niveau (`news:manage` = support, analyste)
 * pouvait donc planter du JavaScript exécuté chez chaque visiteur.
 *
 * Choix d'approche — **valider et refuser**, plutôt qu'assainir :
 * - le nettoyage silencieux exige de produire une sortie correcte dans tous
 *   les cas ; s'y tromper laisse passer une charge utile. Le refus, lui,
 *   échoue *fermé* : toute construction non reconnue est rejetée en 400 et
 *   l'auteur — un administrateur authentifié — voit ce qui coince ;
 * - aucune dépendance à ajouter (registre npm inaccessible ici).
 *
 * ⚠️ Ce contrôle reste une défense côté écriture. La défense de référence à
 * terme est `sanitize-html` (serveur) + DOMPurify (rendu) : à brancher dès
 * qu'un `npm install` est possible — voir AUDIT_PENTEST_2026-07-28.md §11.
 */

/** Balises acceptées → attributs propres à chacune (en plus des globales). */
const ALLOWED_TAGS: Record<string, readonly string[]> = {
  p: [],
  br: [],
  hr: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  code: [],
  pre: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  ul: [],
  ol: ['start'],
  li: [],
  blockquote: [],
  span: [],
  div: [],
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
};

/**
 * `class` est acceptée partout : Tiptap en pose sur les liens, les images et
 * les blocs de code. Elle ne peut rien exécuter — au pire elle référence une
 * classe CSS inexistante.
 */
const GLOBAL_ATTRS: readonly string[] = ['class'];

/** Attributs dont la valeur est une URL — schéma contrôlé. */
const URL_ATTRS = new Set(['href', 'src']);

const SAFE_URL_PREFIXES = [
  'http://',
  'https://',
  'mailto:',
  '/',
  './',
  '../',
  '#',
];

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f']);

export interface SafeHtmlVerdict {
  ok: boolean;
  /** Motif du refus, destiné à l'auteur du contenu (admin authentifié). */
  reason?: string;
}

/**
 * Décode les entités qu'un navigateur interprète DANS une valeur d'attribut,
 * avant le contrôle de schéma : sans cela `&#106;avascript:` passerait.
 * Volontairement permissif (décode aussi les formes sans `;`) — sur-décoder
 * ne peut que provoquer un refus, jamais une acceptation à tort.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&colon;?/gi, ':')
    .replace(/&sol;?/gi, '/')
    .replace(/&tab;?/gi, '\t')
    .replace(/&newline;?/gi, '\n')
    .replace(/&amp;?/gi, '&');
}

function isSafeUrl(rawValue: string): boolean {
  // Les caractères de contrôle et espaces sont ignorés par les navigateurs à
  // l'intérieur d'un schéma (`java\tscript:` s'exécute) → on les retire avant
  // comparaison.
  const value = decodeEntities(rawValue)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020]/g, '')
    .toLowerCase();
  if (value === '') return true;
  if (SAFE_URL_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;

  // Référence relative sans schéma (`photos/a.png`) : acceptée. Le test est
  // celui de la spec URL — un schéma est ce qui précède le premier `:`, et il
  // ne peut contenir ni `/`, ni `?`, ni `#`. `javascript:alert(1)` a donc bien
  // un schéma et reste refusé.
  const schemeEnd = value.indexOf(':');
  if (schemeEnd === -1) return true;
  const beforeColon = value.slice(0, schemeEnd);
  return /[/?#]/.test(beforeColon);
}

/**
 * Analyse le HTML par une machine à états : toute construction inconnue ou
 * malformée provoque un refus (fail-closed). On ne cherche pas à reproduire
 * l'analyseur du navigateur — on n'accepte que ce que l'on sait lire.
 */
export function analyzeHtml(html: string): SafeHtmlVerdict {
  if (html.includes('\u0000')) {
    return { ok: false, reason: 'caractère NUL interdit' };
  }

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) return { ok: true };

    const next = html[lt + 1];
    if (next === undefined) return { ok: true }; // `<` final = texte
    if (next === '!' || next === '?') {
      return {
        ok: false,
        reason: 'commentaire, doctype ou instruction de traitement interdit',
      };
    }

    const isClosing = next === '/';
    const nameStart = lt + (isClosing ? 2 : 1);
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9]*/.exec(html.slice(nameStart));
    if (!nameMatch) {
      if (isClosing) {
        return { ok: false, reason: 'balise fermante malformée' };
      }
      // `<` suivi d'autre chose qu'une lettre : le navigateur le traite comme
      // du texte, nous aussi.
      i = lt + 1;
      continue;
    }

    const tag = nameMatch[0].toLowerCase();
    if (!(tag in ALLOWED_TAGS)) {
      return { ok: false, reason: `balise non autorisée : <${tag}>` };
    }

    let pos = nameStart + nameMatch[0].length;

    if (isClosing) {
      while (pos < html.length && WHITESPACE.has(html[pos])) pos++;
      if (html[pos] !== '>') {
        return { ok: false, reason: `balise fermante malformée : </${tag}>` };
      }
      i = pos + 1;
      continue;
    }

    const allowedAttrs = [...GLOBAL_ATTRS, ...ALLOWED_TAGS[tag]];
    let closed = false;

    while (pos < html.length) {
      const c = html[pos];
      if (WHITESPACE.has(c) || c === '/') {
        pos++;
        continue;
      }
      if (c === '>') {
        pos++;
        closed = true;
        break;
      }

      // Nom d'attribut : tout jusqu'au premier séparateur.
      const attrStart = pos;
      while (
        pos < html.length &&
        !WHITESPACE.has(html[pos]) &&
        html[pos] !== '=' &&
        html[pos] !== '>' &&
        html[pos] !== '/'
      ) {
        pos++;
      }
      const attr = html.slice(attrStart, pos).toLowerCase();
      if (attr === '') {
        return { ok: false, reason: `attribut malformé sur <${tag}>` };
      }
      if (!allowedAttrs.includes(attr)) {
        return {
          ok: false,
          reason: `attribut non autorisé : ${attr} sur <${tag}>`,
        };
      }

      while (pos < html.length && WHITESPACE.has(html[pos])) pos++;
      if (html[pos] !== '=') continue; // attribut booléen
      pos++;
      while (pos < html.length && WHITESPACE.has(html[pos])) pos++;

      let value: string;
      const quote = html[pos];
      if (quote === '"' || quote === "'") {
        const end = html.indexOf(quote, pos + 1);
        if (end === -1) {
          return { ok: false, reason: `valeur d'attribut non terminée (${attr})` };
        }
        value = html.slice(pos + 1, end);
        pos = end + 1;
      } else {
        const valueStart = pos;
        while (
          pos < html.length &&
          !WHITESPACE.has(html[pos]) &&
          html[pos] !== '>'
        ) {
          pos++;
        }
        value = html.slice(valueStart, pos);
      }

      if (URL_ATTRS.has(attr) && !isSafeUrl(value)) {
        return { ok: false, reason: `URL non autorisée dans ${attr}` };
      }
    }

    if (!closed) {
      return { ok: false, reason: `balise <${tag}> non terminée` };
    }
    i = pos;
  }

  return { ok: true };
}

export function isSafeHtml(html: string): boolean {
  return analyzeHtml(html).ok;
}

/**
 * Refuse tout HTML sortant de la liste blanche d'édition riche.
 * À poser sur chaque champ dont le contenu est rendu en HTML côté client.
 */
export function IsSafeHtml(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeHtml',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return isSafeHtml(value);
        },
        defaultMessage(args: ValidationArguments) {
          const verdict =
            typeof args.value === 'string'
              ? analyzeHtml(args.value).reason
              : 'valeur non textuelle';
          return `${args.property} contient du HTML non autorisé (${verdict ?? 'construction inconnue'})`;
        },
      },
    });
  };
}
