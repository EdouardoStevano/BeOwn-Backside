import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { AssurerCodeParrainageService } from '../../applications/assurer-code-parrainage.service';
import { lireParrainageConfig } from '../../applications/parrainage-config';
import { ParrainageAttributionEntity } from '../../infrastructure/persistences/entities/parrainage-attribution.entity';

/**
 * Relevé de parrainage de l'utilisateur connecté.
 *
 * Contrat consommé par `src/data/dataSource/parrainage.datasource.ts` du
 * Frontside (convenu mission benchmark 2026-09-02) :
 * `{ code, lien, nbFilleuls, gainsEur, tauxPct, plafondAnnuelEur, restantAnnuelEur }`.
 *
 * - `code` est GARANTI présent : le service le génère à la volée pour les
 *   comptes nés avant la feature (filet documenté dans
 *   AssurerCodeParrainageService).
 * - `gainsEur` = somme des bonus CRÉDITÉS (montants figés des attributions,
 *   deux rôles confondus) depuis toujours ; `restantAnnuelEur` se calcule sur
 *   l'année civile en cours uniquement — les deux chiffres répondent à deux
 *   questions différentes (« combien ai-je gagné ? » / « combien puis-je
 *   encore gagner cette année ? »).
 * - `lien` est forgé côté serveur depuis FRONTEND_URL : le front ne connaît
 *   pas son propre domaine public en préproduction.
 */
@ApiTags('Parrainage')
@ApiBearerAuth()
@Controller('parrainage')
@UseGuards(JwtAuthGuard)
export class ParrainageController {
  constructor(
    private readonly codes: AssurerCodeParrainageService,
    private readonly config: ConfigService,
    @InjectRepository(ParrainageAttributionEntity)
    private readonly attributions: Repository<ParrainageAttributionEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  @ApiOperation({ summary: 'Mon relevé de parrainage (code, filleuls, gains, plafond)' })
  @ApiResponse({ status: 200, description: 'Relevé de parrainage' })
  @Get('me')
  async me(@CurrentUser() user: ActiveUser) {
    const code = await this.codes.assurer(user.userId);
    const { tauxPct, plafondAnnuelEur } = lireParrainageConfig();

    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const brut = await this.attributions
      .createQueryBuilder('a')
      .select([
        `COALESCE(SUM(CASE WHEN a."parrainId" = :userId THEN a."bonusParrainEur" ELSE 0 END), 0)
         + COALESCE(SUM(CASE WHEN a."filleulId" = :userId THEN a."bonusFilleulEur" ELSE 0 END), 0) AS "gainsEur"`,
        `COALESCE(SUM(CASE WHEN a."creeLe" >= :debutAnnee AND a."parrainId" = :userId THEN a."bonusParrainEur" ELSE 0 END), 0)
         + COALESCE(SUM(CASE WHEN a."creeLe" >= :debutAnnee AND a."filleulId" = :userId THEN a."bonusFilleulEur" ELSE 0 END), 0) AS "percuAnnee"`,
      ])
      .where('a."parrainId" = :userId OR a."filleulId" = :userId')
      .setParameters({ userId: user.userId, debutAnnee })
      .getRawOne<{ gainsEur: string; percuAnnee: string }>();

    // `nbFilleuls` = comptes INSCRITS avec ce code (c'est la promesse du
    // libellé à l'écran, et la motivation immédiate du parrain : son filleul
    // apparaît dès l'inscription) — PAS le nombre d'attributions, qui
    // n'existe qu'au premier investissement définitif. Constaté en e2e :
    // compter les attributions affichait 0 filleul après une inscription
    // réussie, contredisant l'écran.
    const nbFilleuls = await this.users.count({
      where: { parrainePar: user.userId },
    });

    const gainsEur = Number(brut?.gainsEur ?? 0);
    const percuAnnee = Number(brut?.percuAnnee ?? 0);
    const frontend =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    return {
      code,
      lien: `${frontend.replace(/\/$/, '')}/auth/register?ref=${code}`,
      nbFilleuls,
      gainsEur,
      tauxPct,
      plafondAnnuelEur,
      restantAnnuelEur: Math.max(
        0,
        Math.round((plafondAnnuelEur - percuAnnee) * 100) / 100,
      ),
    };
  }
}
