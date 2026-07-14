import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Handlebars from 'handlebars';
import { promises as fs } from 'fs';
import { join } from 'path';
import { EmailTemplateEntity } from './entities/email-template.entity';
import { LAYOUT_STYLE_MAP, wrapInLayout } from './layout';

/**
 * Dossier des templates .hbs historiques — même convention que la config
 * MailerModule d'app.module.ts (les .hbs vivent dans src/ même en prod).
 */
export const TEMPLATES_DIR = join(
  process.cwd(),
  'src',
  'common',
  'email',
  'templates',
);

export interface RenderedEmail {
  sujet: string;
  html: string;
}

interface TemplateMeta {
  nom: string;
  description: string;
  sujet: string;
}

/**
 * Métadonnées de seed des clés connues (sujets historiques des transports).
 * Une clé .hbs absente d'ici est quand même seedée (découverte dynamique du
 * dossier) avec nom = clé et sujet = <title> du fichier : pour enrichir une
 * future clé (ex. ouverture-reservation, compte-supprime), il suffit
 * d'ajouter une entrée.
 */
export const DEFAULT_TEMPLATE_META: Record<string, TemplateMeta> = {
  activation: {
    nom: 'Activation du compte',
    description: "Envoyé à l'inscription : code OTP d'activation du compte.",
    sujet: 'Activez votre compte BeOwn',
  },
  'two-factor': {
    nom: 'Code de connexion (2FA)',
    description:
      "Code à usage unique envoyé lors d'une connexion avec double authentification.",
    sujet: 'Votre code de connexion BeOwn',
  },
  'kyc-validated': {
    nom: 'KYC validé',
    description: "Confirmation de la vérification d'identité.",
    sujet: 'Votre identité a été vérifiée',
  },
  'kyc-rejected': {
    nom: 'KYC refusé',
    description: "Demande de correction du dossier de vérification d'identité.",
    sujet: "Vérification d'identité — mise à jour requise",
  },
  'new-project': {
    nom: 'Nouveau projet',
    description: "Annonce d'un nouveau projet ouvert à l'investissement.",
    sujet: 'Nouveau projet disponible : {{titre}}',
  },
  'new-secondary': {
    nom: 'Nouvelle annonce marché secondaire',
    description:
      'Fractions mises en vente sur le marché secondaire pour un projet suivi.',
    sujet: 'Nouvelle annonce sur le marché secondaire',
  },
  echeance: {
    nom: 'Échéance à venir',
    description: "Rappel d'un versement prévu sur un investissement.",
    sujet: 'Échéance à venir — {{projetTitre}}',
  },
  'depot-confirmed': {
    nom: 'Dépôt confirmé',
    description: "Confirmation du crédit d'un dépôt sur le portefeuille.",
    sujet: 'Dépôt confirmé sur votre compte BeOwn',
  },
  'retrait-processed': {
    nom: 'Retrait en cours',
    description: "Confirmation de la prise en charge d'un retrait.",
    sujet: 'Votre retrait est en cours de traitement',
  },
};

/** Mots-clés Handlebars à exclure de l'extraction de variables. */
const RESERVED_TOKENS = new Set(['else', 'this']);

/**
 * Classes jamais inlinées au seed : leur rendu dépend d'une règle à
 * pseudo-sélecteur du layout (.row:last-child{border:none}) qu'un style
 * inline écraserait.
 */
const INLINE_EXEMPT_CLASSES = new Set(['row']);

const CORPS_RE = /<div class="body">([\s\S]*?)<\/div>\s*<div class="footer">/;

/** Titre du document (<title>) d'un .hbs — sujet de secours au seed. */
export function extractTitle(source: string): string | null {
  const m = /<title>([^<]*)<\/title>/i.exec(source);
  const title = m?.[1].trim();
  return title ? title : null;
}

/** Variables `{{var}}` / `{{#if var}}` d'un contenu Handlebars, triées, dédupliquées. */
export function extractVariables(content: string): string[] {
  const vars = new Set<string>();
  for (const m of content.matchAll(/\{\{#if\s+([A-Za-z_][\w.]*)\s*\}\}/g)) {
    vars.add(m[1]);
  }
  for (const m of content.matchAll(/\{\{\s*([A-Za-z_][\w.]*)\s*\}\}/g)) {
    if (!RESERVED_TOKENS.has(m[1])) vars.add(m[1]);
  }
  return [...vars].sort();
}

/**
 * Déclarations CSS par classe du <style> d'un .hbs.
 *
 * Parser volontairement minimal, calibré sur le CSS minifié mono-sélecteur
 * des .hbs historiques (`.classe{...}`) : sélecteurs composés, media queries
 * et pseudo-sélecteurs (.row:last-child…) sont ignorés. Une règle non parsée
 * n'est pas grave : le défaut du layout s'applique alors silencieusement
 * (dégradation cosmétique, jamais bloquante).
 */
function parseStyleMap(source: string): Record<string, string> {
  const styles: Record<string, string> = {};
  const styleBlock = /<style>([\s\S]*?)<\/style>/i.exec(source)?.[1] ?? '';
  for (const m of styleBlock.matchAll(/\.([\w-]+)\{([^}]*)\}/g)) {
    styles[m[1]] = m[2].trim();
  }
  return styles;
}

/**
 * Préserve la fidélité visuelle des corps seedés : la feuille de style du
 * layout est une « union » à défaut unique par classe, or certains .hbs
 * déclinent une même classe différemment (.h1/.p centrés, .badge rouge du
 * KYC refusé…). Quand la déclaration du template source diffère du défaut du
 * layout, elle est inlinée sur les éléments concernés du corps extrait.
 *
 * Limites assumées : ne cible que les attributs `class="cls"` mono-classe du
 * markup minifié des .hbs historiques. Un élément non matché (multi-classes,
 * attribut réordonné, style déjà présent) reste tel quel et hérite du défaut
 * du layout — silencieux et purement cosmétique.
 */
function inlineVariantStyles(
  corps: string,
  sourceStyles: Record<string, string>,
): string {
  let out = corps;
  for (const [cls, decl] of Object.entries(sourceStyles)) {
    if (INLINE_EXEMPT_CLASSES.has(cls)) continue;
    if (LAYOUT_STYLE_MAP[cls] === decl) continue;
    out = out.split(`class="${cls}"`).join(`class="${cls}" style="${decl}"`);
  }
  return out;
}

/**
 * Corps métier d'un .hbs historique : contenu de <div class="body">, sans
 * header ni footer (réinjectés par le layout fixe au rendu), avec inlining
 * des styles propres au template (voir inlineVariantStyles).
 *
 * Retourne null si la structure body/footer attendue est introuvable :
 * seeder le document complet dans le layout donnerait un email doublement
 * enveloppé — l'appelant (seedDefaults) loggue et saute la clé, le rendu de
 * cette clé restant assuré par le fallback fichier de render().
 */
export function extractCorps(source: string): string | null {
  const match = CORPS_RE.exec(source);
  if (!match) return null;
  return inlineVariantStyles(match[1].trim(), parseStyleMap(source));
}

/**
 * Rendu des emails transactionnels :
 * - template DB si présent (sujet + corps Handlebars, corps injecté dans le
 *   layout fixe BeOwn) ;
 * - fallback sur le fichier .hbs du code si la clé n'existe pas en base ;
 * - template désactivé → null (l'appelant loggue et n'envoie pas).
 *
 * Exposé globalement via EmailModule (@Global) : transports Brevo/Nodemailer,
 * API admin des templates (V2-T2), BroadcastService…
 */
@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);
  /** Cache des .hbs du code (immuables au runtime) — les templates DB, éditables, ne sont pas cachés. */
  private readonly fileCache = new Map<string, string | null>();

  constructor(
    @InjectRepository(EmailTemplateEntity)
    private readonly repo: Repository<EmailTemplateEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  /**
   * Rend le sujet et le HTML complet de l'email `key` avec les variables
   * `vars`. Variables manquantes → chaîne vide (jamais de throw). Retourne
   * null si le template est désactivé ou introuvable (DB ET code).
   */
  async render(
    key: string,
    vars: Record<string, unknown> = {},
  ): Promise<RenderedEmail | null> {
    let row: EmailTemplateEntity | null = null;
    try {
      row = await this.repo.findOne({ where: { key } });
    } catch (err) {
      // Panne DB transitoire ou table absente : l'envoi d'emails (chemin
      // chaud) ne doit pas en dépendre — on dégrade sur le .hbs du code.
      this.logger.error(
        `Lecture du template "${key}" en base impossible — fallback sur le fichier .hbs`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    if (row) {
      if (!row.enabled) return null;
      try {
        const sujet = this.compileSujet(row.sujet, vars);
        const corps = this.compileHtml(row.corpsHtml, vars);
        return { sujet, html: wrapInLayout(corps, sujet) };
      } catch (err) {
        // Un template DB syntaxiquement invalide (édition admin ratée) ne
        // doit pas bloquer l'envoi : on retombe sur le .hbs du code.
        this.logger.error(
          `Template DB "${key}" invalide — fallback sur le fichier .hbs`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    const source = await this.readTemplateFile(key);
    if (source === null) {
      this.logger.warn(
        `Template email "${key}" introuvable (ni en base, ni dans ${TEMPLATES_DIR})`,
      );
      return null;
    }
    const sujetTpl =
      DEFAULT_TEMPLATE_META[key]?.sujet ?? extractTitle(source) ?? key;
    return {
      sujet: this.compileSujet(sujetTpl, vars),
      // Les .hbs du code embarquent déjà leur layout complet : rendu tel quel.
      html: this.compileHtml(source, vars),
    };
  }

  /**
   * Insère les clés MANQUANTES depuis les .hbs du dossier (découverte
   * dynamique : une future clé ajoutée au dossier est seedée sans changer ce
   * code). N'écrase JAMAIS une ligne existante — idempotent.
   */
  async seedDefaults(): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(TEMPLATES_DIR);
    } catch (err) {
      this.logger.error(
        `Dossier des templates emails introuvable : ${TEMPLATES_DIR}`,
        err instanceof Error ? err.stack : undefined,
      );
      return;
    }

    const keys = files
      .filter((f) => f.endsWith('.hbs'))
      .map((f) => f.slice(0, -'.hbs'.length))
      .sort();

    for (const key of keys) {
      try {
        const existing = await this.repo.findOne({ where: { key } });
        if (existing) continue;

        const source = await fs.readFile(
          join(TEMPLATES_DIR, `${key}.hbs`),
          'utf8',
        );
        const corpsHtml = extractCorps(source);
        if (corpsHtml === null) {
          this.logger.warn(
            `Structure inattendue de ${key}.hbs (pas de <div class="body">…<div class="footer">) — clé non seedée, le rendu passera par le fallback fichier`,
          );
          continue;
        }
        const meta = DEFAULT_TEMPLATE_META[key] ?? {
          nom: key,
          description: `Template « ${key} »`,
          sujet: extractTitle(source) ?? key,
        };
        await this.repo.insert({
          key,
          nom: meta.nom,
          description: meta.description,
          sujet: meta.sujet,
          corpsHtml,
          variables: extractVariables(`${meta.sujet} ${corpsHtml}`),
          enabled: true,
          updatedBy: null,
        });
        this.logger.log(`Template email seedé depuis le code : ${key}`);
      } catch (err) {
        // Un template illisible (ou une course d'insertion entre plusieurs
        // instances) ne doit bloquer ni le boot ni le seed des autres clés.
        this.logger.error(
          `Seed du template email "${key}" impossible`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
  }

  /** Corps/HTML : échappement Handlebars actif, variable manquante → chaîne vide. */
  private compileHtml(template: string, vars: Record<string, unknown>): string {
    return Handlebars.compile(template, { strict: false })(vars);
  }

  /**
   * Sujet : compilé SANS échappement HTML — un sujet est du texte brut, pas
   * du HTML ; l'échappement transformerait « L'Horizon » en « L&#x27;Horizon »
   * dans la boîte de réception (comportement historique : interpolation brute).
   */
  private compileSujet(
    template: string,
    vars: Record<string, unknown>,
  ): string {
    return Handlebars.compile(template, { strict: false, noEscape: true })(
      vars,
    );
  }

  private async readTemplateFile(key: string): Promise<string | null> {
    if (this.fileCache.has(key)) return this.fileCache.get(key) ?? null;
    // Garde-fou anti-traversée : la clé vient du code appelant, mais elle
    // finira exposée via l'API admin — on ne lit que des noms de fichier plats.
    if (!/^[\w-]+$/.test(key)) return null;
    let source: string | null;
    try {
      source = await fs.readFile(join(TEMPLATES_DIR, `${key}.hbs`), 'utf8');
    } catch {
      source = null;
    }
    this.fileCache.set(key, source);
    return source;
  }
}
