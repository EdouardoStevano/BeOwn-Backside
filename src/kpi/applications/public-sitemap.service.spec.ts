import {
  PublicSitemapService,
  STATUTS_PROJETS_PUBLICS,
} from './public-sitemap.service';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

describe('PublicSitemapService', () => {
  const buildDataSource = (rows: Array<{ slug: string; updatedAt: string }>) => ({
    query: jest.fn().mockResolvedValue(rows),
  });

  it('liste chaque projet public en <url> avec loc beown.fr et lastmod ISO', async () => {
    const ds = buildDataSource([
      { slug: 'villa-hermitage', updatedAt: '2026-09-01T10:00:00.000Z' },
      { slug: 'residence-barachois', updatedAt: '2026-08-15T08:30:00.000Z' },
    ]);
    const service = new PublicSitemapService(ds as any);

    const xml = await service.xml();

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://beown.fr/projects/villa-hermitage</loc>');
    expect(xml).toContain('<loc>https://beown.fr/projects/residence-barachois</loc>');
    expect(xml).toContain('<lastmod>2026-09-01T10:00:00.000Z</lastmod>');
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).toContain('</urlset>');
  });

  it('interroge STRICTEMENT les statuts publics de GET /projects/public', async () => {
    const ds = buildDataSource([]);
    const service = new PublicSitemapService(ds as any);

    await service.xml();

    const [sql, params] = ds.query.mock.calls[0];
    expect(sql).toContain('statut = ANY($1)');
    expect(params[0]).toEqual([
      ProjectStatus.ANNONCE,
      ProjectStatus.PRE_INVESTISSEMENT,
      ProjectStatus.EN_COLLECTE,
      ProjectStatus.FINANCE,
    ]);
    // La constante partagée ne doit jamais embarquer un statut non public.
    expect(STATUTS_PROJETS_PUBLICS).not.toContain(ProjectStatus.BROUILLON);
    expect(STATUTS_PROJETS_PUBLICS).not.toContain(ProjectStatus.EN_EXPLOITATION);
  });

  it('échappe les caractères XML dans les slugs', async () => {
    const ds = buildDataSource([
      { slug: 'lot-a&b<1>', updatedAt: '2026-09-01T10:00:00.000Z' },
    ]);
    const service = new PublicSitemapService(ds as any);

    const xml = await service.xml();

    expect(xml).toContain('<loc>https://beown.fr/projects/lot-a&amp;b&lt;1&gt;</loc>');
    expect(xml).not.toContain('a&b');
  });

  it('aucun projet public → urlset vide mais XML valide', async () => {
    const ds = buildDataSource([]);
    const service = new PublicSitemapService(ds as any);

    const xml = await service.xml();

    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
    expect(xml).not.toContain('<url>');
  });

  it('cache 1 h : second appel servi de mémoire, relu après expiration', async () => {
    const ds = buildDataSource([]);
    const service = new PublicSitemapService(ds as any);
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1_000_000);
      await service.xml();
      await service.xml();
      expect(ds.query).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1_000_000 + 3_601_000);
      await service.xml();
      expect(ds.query).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
