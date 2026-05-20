import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { CloudStorageService } from 'src/common/cloud-storage/cloud-storage.service';
import { AddUniteLouableUseCase } from '../../applications/usecases/add-unite-louable.usecase';
import { CreateBailUseCase } from '../../applications/usecases/create-bail.usecase';
import { UpdateBailUseCase } from '../../applications/usecases/update-bail.usecase';
import { ResilierBailUseCase } from '../../applications/usecases/resilier-bail.usecase';
import { DeclareLoyerEncaisseUseCase } from '../../applications/usecases/declare-loyer-encaisse.usecase';
import { DeclareChargeUseCase } from '../../applications/usecases/declare-charge.usecase';
import { GetProjectOccupationUseCase } from '../../applications/usecases/get-project-occupation.usecase';
import { GetProjectEtatFinancierUseCase } from '../../applications/usecases/get-project-etat-financier.usecase';
import {
  UNITE_LOUABLE_REPOSITORY,
  type UniteLouableRepository,
} from '../../applications/ports/repositories/unite-louable.repository';
import {
  BAIL_REPOSITORY,
  type BailRepository,
} from '../../applications/ports/repositories/bail.repository';
import {
  LOCATAIRE_REPOSITORY,
  type LocataireRepository,
} from '../../applications/ports/repositories/locataire.repository';
import { AddUniteLouableDto } from '../dto/unite-louable.dto';
import { CreateBailDto } from '../dto/bail.dto';
import { DeclareLoyerDto } from '../dto/loyer-encaisse.dto';
import { DeclareChargeDto } from '../dto/charge.dto';
import { UpdateBailDto, ResilierBailDto } from '../dto/update-bail.dto';
import { StatutBail } from '../../domains/enums/statut-bail.enum';

@ApiTags('Porteur — Gestion locative')
@ApiBearerAuth()
@Controller('porteur')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.PORTEUR)
export class PorteurController {
  constructor(
    private readonly addUniteLouable: AddUniteLouableUseCase,
    private readonly createBail: CreateBailUseCase,
    private readonly updateBail: UpdateBailUseCase,
    private readonly resilierBail: ResilierBailUseCase,
    private readonly declareLoyer: DeclareLoyerEncaisseUseCase,
    private readonly declareCharge: DeclareChargeUseCase,
    private readonly getOccupation: GetProjectOccupationUseCase,
    private readonly getEtatFinancier: GetProjectEtatFinancierUseCase,
    @Inject(UNITE_LOUABLE_REPOSITORY)
    private readonly uniteRepo: UniteLouableRepository,
    @Inject(BAIL_REPOSITORY)
    private readonly bailRepo: BailRepository,
    @Inject(LOCATAIRE_REPOSITORY)
    private readonly locataireRepo: LocataireRepository,
    private readonly cloudStorage: CloudStorageService,
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

  @Get('projects/:id/unites')
  @ApiOperation({ summary: "Lister les unités louables d'un projet" })
  listUnites(@Param('id') projetId: string) {
    return this.uniteRepo.findByProjet(projetId);
  }

  @Get('projects/:id/baux')
  @ApiOperation({ summary: "Lister les baux actifs d'un projet" })
  listBauxActifs(@Param('id') projetId: string) {
    return this.bailRepo.findActifsByProjet(projetId);
  }

  @Get('spv/:spvId/locataires')
  @ApiOperation({ summary: "Lister les locataires d'une SCI" })
  listLocataires(@Param('spvId') spvId: string) {
    return this.locataireRepo.findBySpv(spvId);
  }

  @Patch('baux/:id')
  @ApiOperation({ summary: 'Modifier un bail (loyer, date fin, contrat PDF)' })
  updateBailEndpoint(
    @Param('id') id: string,
    @Body() dto: UpdateBailDto,
  ) {
    return this.updateBail.execute({
      id,
      loyerMensuel: dto.loyerMensuel,
      dateFin: dto.dateFin === undefined ? undefined : dto.dateFin === null ? null : new Date(dto.dateFin),
      contratPdfUrl: dto.contratPdfUrl,
    });
  }

  @Post('baux/:id/resilier')
  @ApiOperation({
    summary: 'Résilier ou terminer un bail (statut RESILIE ou TERMINE)',
  })
  resilierBailEndpoint(
    @Param('id') id: string,
    @Body() dto: ResilierBailDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const finalStatus =
      dto.statutFinal === 'termine' ? StatutBail.TERMINE : StatutBail.RESILIE;
    return this.resilierBail.execute(id, user.userId, dto.motif, finalStatus);
  }

  @Post('upload-proof')
  @ApiOperation({
    summary:
      "Upload d'un fichier preuve/justificatif (relevé bancaire, facture, contrat)",
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadProof(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni.');
    }
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non autorisé (${file.mimetype}). Utilisez PDF, JPEG, PNG ou WEBP.`,
      );
    }
    const { publicUrl } = await this.cloudStorage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      'porteur-proofs',
    );
    return { url: publicUrl, originalName: file.originalname, sizeBytes: file.size };
  }
}
