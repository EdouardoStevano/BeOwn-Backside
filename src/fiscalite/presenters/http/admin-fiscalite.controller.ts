import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { IfuCronService } from '../../applications/ifu-cron.service';
import { GenerateInvestisseurIfuUseCase } from '../../applications/usecases/generate-investisseur-ifu.usecase';

@ApiTags('Admin — Fiscalité')
@ApiBearerAuth()
@Controller('admin/fiscalite')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE)
export class AdminFiscaliteController {
  constructor(
    private readonly cronService: IfuCronService,
    private readonly generateUseCase: GenerateInvestisseurIfuUseCase,
  ) {}

  @Post('ifu/generate-all/:annee')
  @ApiOperation({
    summary:
      'Génère les IFU de tous les investisseurs ayant reçu des distributions sur l\'année',
  })
  generateAll(@Param('annee') anneeStr: string) {
    const annee = parseInt(anneeStr, 10);
    if (!Number.isFinite(annee) || annee < 2000 || annee > 2100) {
      throw new BadRequestException('Année invalide.');
    }
    return this.cronService.run(annee);
  }

  @Post('ifu/generate/:userId/:annee')
  @ApiOperation({
    summary: 'Force la régénération d\'un IFU spécifique (admin)',
  })
  generateOne(
    @Param('userId') userIdStr: string,
    @Param('annee') anneeStr: string,
  ) {
    const userId = parseInt(userIdStr, 10);
    const annee = parseInt(anneeStr, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(annee)) {
      throw new BadRequestException('Paramètres invalides.');
    }
    return this.generateUseCase.execute(userId, annee);
  }
}
