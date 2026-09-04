import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import { PublicSitemapService } from '../../applications/public-sitemap.service';

/**
 * Sitemap dynamique des fiches projets — consommé par les crawlers via le
 * robots.txt du Frontside (mission 8), PAS proxifié par nginx. Contenu 100 %
 * public : slugs et dates de mise à jour, aucune PII.
 */
@ApiTags('Public — Sitemap')
@Controller('public')
export class PublicSitemapController {
  constructor(private readonly sitemap: PublicSitemapService) {}

  @ApiOperation({ summary: 'Sitemap XML des fiches projets publiques' })
  @ApiResponse({ status: 200, description: 'Sitemap XML (cache 1 h)' })
  @Public()
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  get(): Promise<string> {
    return this.sitemap.xml();
  }
}
