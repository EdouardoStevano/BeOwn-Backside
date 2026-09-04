import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

/**
 * Statuts rendant une fiche projet PUBLIQUE — strictement les mêmes que
 * `GET /projects/public` (project.controller `listPublic`) : une URL qui
 * entre au sitemap doit répondre 200 sur la vitrine, rien de plus.
 */
export const STATUTS_PROJETS_PUBLICS: readonly ProjectStatus[] = [
  ProjectStatus.ANNONCE,
  ProjectStatus.PRE_INVESTISSEMENT,
  ProjectStatus.EN_COLLECTE,
  ProjectStatus.FINANCE,
];

/** Racine publique des fiches projets côté Frontside. */
const BASE_URL = 'https://beown.fr/projects';

// Échappement XML minimal — les slugs sont contrôlés à la création mais un
// sitemap ne doit JAMAIS pouvoir être cassé par une donnée.
const escapeXml = (valeur: string): string =>
  valeur.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&apos;',
  );

/**
 * Sitemap XML dynamique des fiches projets publiques.
 *
 * CACHE 1 h EN MÉMOIRE DE PROCESSUS — même entorse stateless assumée (et même
 * mécanique) que PublicStatisticsService : donnée publique, idempotente,
 * identique pour tous ; la perdre coûte UNE requête indexée ; la divergence
 * entre réplicas est bornée à 1 h sur un document que les crawlers relisent
 * au mieux quotidiennement.
 */
@Injectable()
export class PublicSitemapService {
  private static readonly TTL_MS = 3_600_000;
  private cache: { calculeA: number; xml: string } | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async xml(): Promise<string> {
    const maintenant = Date.now();
    if (
      this.cache &&
      maintenant - this.cache.calculeA < PublicSitemapService.TTL_MS
    ) {
      return this.cache.xml;
    }

    const projets: Array<{ slug: string; updatedAt: Date | string }> =
      await this.dataSource.query(
        `SELECT slug, "updatedAt"
         FROM projet
         WHERE statut = ANY($1)
         ORDER BY "updatedAt" DESC`,
        [STATUTS_PROJETS_PUBLICS],
      );

    const urls = projets
      .map(
        (p) =>
          `  <url>\n` +
          `    <loc>${BASE_URL}/${escapeXml(p.slug)}</loc>\n` +
          `    <lastmod>${new Date(p.updatedAt).toISOString()}</lastmod>\n` +
          `  </url>`,
      )
      .join('\n');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${urls}${urls ? '\n' : ''}` +
      `</urlset>\n`;

    this.cache = { calculeA: maintenant, xml };
    return xml;
  }
}
