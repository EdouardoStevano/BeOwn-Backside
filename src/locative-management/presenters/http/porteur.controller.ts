import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { AddUniteLouableUseCase } from '../../applications/usecases/add-unite-louable.usecase';
import { CreateBailUseCase } from '../../applications/usecases/create-bail.usecase';
import { DeclareLoyerEncaisseUseCase } from '../../applications/usecases/declare-loyer-encaisse.usecase';
import { DeclareChargeUseCase } from '../../applications/usecases/declare-charge.usecase';
import { GetProjectOccupationUseCase } from '../../applications/usecases/get-project-occupation.usecase';
import { GetProjectEtatFinancierUseCase } from '../../applications/usecases/get-project-etat-financier.usecase';
import { AddUniteLouableDto } from '../dto/unite-louable.dto';
import { CreateBailDto } from '../dto/bail.dto';
import { DeclareLoyerDto } from '../dto/loyer-encaisse.dto';
import { DeclareChargeDto } from '../dto/charge.dto';

@ApiTags('Porteur — Gestion locative')
@ApiBearerAuth()
@Controller('porteur')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.PORTEUR)
export class PorteurController {
  constructor(
    private readonly addUniteLouable: AddUniteLouableUseCase,
    private readonly createBail: CreateBailUseCase,
    private readonly declareLoyer: DeclareLoyerEncaisseUseCase,
    private readonly declareCharge: DeclareChargeUseCase,
    private readonly getOccupation: GetProjectOccupationUseCase,
    private readonly getEtatFinancier: GetProjectEtatFinancierUseCase,
  ) {}

  @Post('unites')
  @ApiOperation({ summary: 'Créer une unité louable' })
  createUnite(@Body() dto: AddUniteLouableDto) {
    return this.addUniteLouable.execute({
      projetId: dto.projetId,
      reference: dto.reference,
      surfaceM2: dto.surfaceM2 ?? null,
      loyerMensuelCible: dto.loyerMensuelCible,
    });
  }

  @Post('baux')
  @ApiOperation({ summary: 'Créer un bail (avec locataire inline)' })
  createBailEndpoint(@Body() dto: CreateBailDto) {
    return this.createBail.execute({
      uniteLouableId: dto.uniteLouableId,
      locataire: dto.locataire,
      loyerMensuel: dto.loyerMensuel,
      dateDebut: new Date(dto.dateDebut),
      dateFin: dto.dateFin ? new Date(dto.dateFin) : null,
      spvId: dto.spvId,
      contratPdfUrl: dto.contratPdfUrl,
    });
  }

  @Post('loyers')
  @ApiOperation({ summary: 'Déclarer un loyer encaissé (statut DECLARE)' })
  declareLoyerEndpoint(
    @Body() dto: DeclareLoyerDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.declareLoyer.execute({
      bailId: dto.bailId,
      periode: dto.periode,
      montant: dto.montant,
      dateEncaissement: new Date(dto.dateEncaissement),
      preuves: dto.preuves,
      declareParUserId: user.userId,
    });
  }

  @Post('charges')
  @ApiOperation({ summary: 'Déclarer une charge (statut DECLARE)' })
  declareChargeEndpoint(
    @Body() dto: DeclareChargeDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.declareCharge.execute({
      projetId: dto.projetId,
      type: dto.type,
      description: dto.description,
      montant: dto.montant,
      periode: dto.periode,
      dateOperation: new Date(dto.dateOperation),
      justificatifs: dto.justificatifs,
      declareParUserId: user.userId,
    });
  }

  @Get('projects/:id/occupation')
  @ApiOperation({ summary: "Taux d'occupation actuel du projet" })
  getOccupationEndpoint(@Param('id') projetId: string) {
    return this.getOccupation.execute(projetId);
  }

  @Get('projects/:id/etat-financier/:periode')
  @ApiOperation({ summary: 'P&L validé du projet pour une période (YYYY-MM)' })
  getEtatFinancierEndpoint(
    @Param('id') projetId: string,
    @Param('periode') periode: string,
  ) {
    return this.getEtatFinancier.execute(projetId, periode);
  }
}
