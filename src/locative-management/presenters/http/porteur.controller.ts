import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { PorteurAccessGuard } from 'src/common/auth/porteur-access.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
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
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from 'src/projects/applications/ports/repositories/project.repository';
import { AuditSansCorps } from 'src/common/audit/audit-sans-corps.decorator';

/**
 * Espace porteur — gestion locative.
 *
 * `@Roles(UserRole.PORTEUR)` a été REMPLACÉ par `PorteurAccessGuard` (lot 4,
 * décision fondateur D1) : l'espace porteur s'ouvre désormais aux porteurs
 * « purs » ET aux investisseurs dont la demande d'accès a été acceptée
 * (`users.porteurAccess = true`), qui conservent leur rôle. Les deux gardes ne
 * se cumulent pas — le `RolesGuard` global refuserait l'investisseur avant que
 * celui-ci ne s'exécute.
 *
 * Le verdict est relu EN BASE à chaque requête (jamais dans le jeton), et il
 * ne dit QUE « ce compte a un espace porteur ». À quels projets il touche
 * reste décidé, route par route, par les contrôles d'appartenance ci-dessous
 * (`assertOwnsProject`, `assertOwnsBail`, `assertOwnsUnite`, `assertOwnsSpv`)
 * — inchangés.
 */
@ApiTags('Porteur — Gestion locative')
@ApiBearerAuth()
// Les baux portent l'identité NOMINATIVE d'un TIERS — le locataire — que ni
// la plateforme ni le porteur n'ont de raison de conserver cinq ans dans un
// journal d'audit ; les loyers et charges déclarés y ajoutent des montants et
// des libellés en texte libre.
@AuditSansCorps()
@Controller('porteur')
@UseGuards(JwtAuthGuard, PorteurAccessGuard)
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
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    private readonly cloudStorage: CloudStorageService,
  ) {}

  /** Anti-IDOR : le projet doit exister ET appartenir au porteur connecté. */
  private async assertOwnsProject(
    projetId: string,
    userId: number,
  ): Promise<void> {
    const project = await this.projectRepo.findProjectById(projetId);
    if (!project) throw new NotFoundException('Projet introuvable.');
    if (project.porteurId !== userId) {
      throw new ForbiddenException(
        "Ce projet n'est pas rattaché à votre compte porteur.",
      );
    }
  }

  /** Remonte bail → unité → projet et vérifie la propriété. */
  private async assertOwnsBail(bailId: string, userId: number): Promise<void> {
    const bail = await this.bailRepo.findById(bailId);
    if (!bail) throw new NotFoundException('Bail introuvable.');
    const unite = await this.uniteRepo.findById(bail.uniteLouableId);
    if (!unite) throw new NotFoundException('Unité louable introuvable.');
    await this.assertOwnsProject(unite.projetId, userId);
  }

  /** Vérifie unité → projet. */
  private async assertOwnsUnite(
    uniteLouableId: string,
    userId: number,
  ): Promise<void> {
    const unite = await this.uniteRepo.findById(uniteLouableId);
    if (!unite) throw new NotFoundException('Unité louable introuvable.');
    await this.assertOwnsProject(unite.projetId, userId);
  }

  /** Vérifie que la SCI est rattachée à au moins un projet du porteur. */
  private async assertOwnsSpv(spvId: string, userId: number): Promise<void> {
    const { data } = await this.projectRepo.findAllProjects({
      porteurId: userId,
      limit: 200,
    });
    if (!data.some((p) => p.spvId === spvId)) {
      throw new ForbiddenException(
        "Cette SCI n'est rattachée à aucun de vos projets.",
      );
    }
  }

  @Get('projects')
  @ApiOperation({ summary: 'Lister les projets rattachés au porteur connecté' })
  async listMyProjects(@CurrentUser() user: ActiveUser) {
    const { data } = await this.projectRepo.findAllProjects({
      porteurId: user.userId,
      limit: 200,
    });
    return data;
  }

  @Post('unites')
  @ApiOperation({ summary: 'Créer une unité louable' })
  async createUnite(
    @Body() dto: AddUniteLouableDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsProject(dto.projetId, user.userId);
    return this.addUniteLouable.execute({
      projetId: dto.projetId,
      reference: dto.reference,
      surfaceM2: dto.surfaceM2 ?? null,
      loyerMensuelCible: dto.loyerMensuelCible,
    });
  }

  @Post('baux')
  @ApiOperation({ summary: 'Créer un bail (avec locataire inline)' })
  @ApiResponse({
    status: 403,
    description: "Unité ou SCI n'appartenant pas au porteur",
  })
  async createBailEndpoint(
    @Body() dto: CreateBailDto,
    @CurrentUser() user: ActiveUser,
  ) {
    // DEUX rattachements à vérifier, pas un. Seule l'unité l'était : un
    // porteur pouvait créer un bail sur SON bien en le rattachant à la SCI
    // d'un AUTRE porteur — les loyers et le locataire nominatif entraient
    // alors dans la comptabilité d'un tiers. La garde existait déjà
    // (`assertOwnsSpv`, utilisée ailleurs dans ce contrôleur) ; elle n'était
    // simplement pas appelée ici.
    await Promise.all([
      this.assertOwnsUnite(dto.uniteLouableId, user.userId),
      this.assertOwnsSpv(dto.spvId, user.userId),
    ]);
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
  async declareLoyerEndpoint(
    @Body() dto: DeclareLoyerDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsBail(dto.bailId, user.userId);
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
  async declareChargeEndpoint(
    @Body() dto: DeclareChargeDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsProject(dto.projetId, user.userId);
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
  async getOccupationEndpoint(
    @Param('id') projetId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsProject(projetId, user.userId);
    return this.getOccupation.execute(projetId);
  }

  @Get('projects/:id/etat-financier/:periode')
  @ApiOperation({ summary: 'P&L validé du projet pour une période (YYYY-MM)' })
  async getEtatFinancierEndpoint(
    @Param('id') projetId: string,
    @Param('periode') periode: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsProject(projetId, user.userId);
    return this.getEtatFinancier.execute(projetId, periode);
  }

  @Get('projects/:id/unites')
  @ApiOperation({ summary: "Lister les unités louables d'un projet" })
  async listUnites(
    @Param('id') projetId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsProject(projetId, user.userId);
    return this.uniteRepo.findByProjet(projetId);
  }

  @Get('projects/:id/baux')
  @ApiOperation({ summary: "Lister les baux actifs d'un projet" })
  async listBauxActifs(
    @Param('id') projetId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsProject(projetId, user.userId);
    return this.bailRepo.findActifsByProjet(projetId);
  }

  @Get('spv/:spvId/locataires')
  @ApiOperation({ summary: "Lister les locataires d'une SCI" })
  async listLocataires(
    @Param('spvId') spvId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsSpv(spvId, user.userId);
    return this.locataireRepo.findBySpv(spvId);
  }

  @Patch('baux/:id')
  @ApiOperation({ summary: 'Modifier un bail (loyer, date fin, contrat PDF)' })
  async updateBailEndpoint(
    @Param('id') id: string,
    @Body() dto: UpdateBailDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsBail(id, user.userId);
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
  async resilierBailEndpoint(
    @Param('id') id: string,
    @Body() dto: ResilierBailDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.assertOwnsBail(id, user.userId);
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
