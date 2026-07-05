import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import {
  LOYER_ENCAISSE_REPOSITORY,
  type LoyerEncaisseRepository,
} from '../../applications/ports/repositories/loyer-encaisse.repository';
import {
  CHARGE_REPOSITORY,
  type ChargeRepository,
} from '../../applications/ports/repositories/charge.repository';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';
import { ValidateLoyerEncaisseUseCase } from '../../applications/usecases/validate-loyer-encaisse.usecase';
import { ValidateChargeUseCase } from '../../applications/usecases/validate-charge.usecase';
import { RejectDeclarationDto } from '../dto/admin-validate.dto';

@ApiTags('Admin — Gestion locative')
@ApiBearerAuth()
@Controller('admin/locative')
@UseGuards(JwtAuthGuard)
@RequirePermission('locatif:manage')
export class AdminLocativeController {
  constructor(
    @Inject(LOYER_ENCAISSE_REPOSITORY)
    private readonly loyerRepo: LoyerEncaisseRepository,
    @Inject(CHARGE_REPOSITORY) private readonly chargeRepo: ChargeRepository,
    private readonly validateLoyer: ValidateLoyerEncaisseUseCase,
    private readonly validateCharge: ValidateChargeUseCase,
  ) {}

  @Get('loyers/pending')
  @ApiOperation({ summary: 'Loyers en attente de validation' })
  listLoyersPending() {
    return this.loyerRepo.findByStatut(StatutDeclaration.DECLARE);
  }

  @Post('loyers/:id/validate')
  @ApiOperation({ summary: 'Valider un loyer déclaré' })
  validateLoyerEndpoint(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.validateLoyer.validate(id, user.userId);
  }

  @Post('loyers/:id/reject')
  @ApiOperation({ summary: 'Rejeter un loyer déclaré (motif requis)' })
  rejectLoyerEndpoint(
    @Param('id') id: string,
    @Body() dto: RejectDeclarationDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.validateLoyer.reject(id, user.userId, dto.motif);
  }

  @Get('charges/pending')
  @ApiOperation({ summary: 'Charges en attente de validation' })
  listChargesPending() {
    return this.chargeRepo.findByStatut(StatutDeclaration.DECLARE);
  }

  @Post('charges/:id/validate')
  @ApiOperation({ summary: 'Valider une charge déclarée' })
  validateChargeEndpoint(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.validateCharge.validate(id, user.userId);
  }

  @Post('charges/:id/reject')
  @ApiOperation({ summary: 'Rejeter une charge déclarée (motif requis)' })
  rejectChargeEndpoint(
    @Param('id') id: string,
    @Body() dto: RejectDeclarationDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.validateCharge.reject(id, user.userId, dto.motif);
  }
}
