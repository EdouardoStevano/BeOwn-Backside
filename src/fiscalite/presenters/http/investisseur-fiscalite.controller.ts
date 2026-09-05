import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import {
  DOCUMENT_FISCAL_REPOSITORY,
  type DocumentFiscalRepository,
} from '../../applications/ports/repositories/document-fiscal.repository';
import { GenerateInvestisseurIfuUseCase } from '../../applications/usecases/generate-investisseur-ifu.usecase';
import { IfuPdfService } from '../../applications/ifu-pdf.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from 'src/profiles/applications/ports/repositories/profil.repository';

@ApiTags('Investisseur — Documents fiscaux')
@ApiBearerAuth()
@Controller('investisseur/documents-fiscaux')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.INVESTISSEUR)
export class InvestisseurFiscaliteController {
  constructor(
    @Inject(DOCUMENT_FISCAL_REPOSITORY)
    private readonly docRepo: DocumentFiscalRepository,
    private readonly generateUseCase: GenerateInvestisseurIfuUseCase,
    private readonly pdfService: IfuPdfService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    // Identification fiscale du bénéficiaire (résidence fiscale, NIF) portée
    // par le profil personne physique — voir la justification réglementaire
    // dans `IfuPdfService`.
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepo: ProfilRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liste des IFU disponibles pour l\'utilisateur connecté',
  })
  async list(@CurrentUser() user: ActiveUser) {
    return this.docRepo.findByUser(user.userId);
  }

  @Get(':annee/download')
  @ApiOperation({
    summary:
      'Télécharge l\'IFU PDF pour une année donnée (régénère si nécessaire)',
  })
  async download(
    @Param('annee') anneeStr: string,
    @CurrentUser() user: ActiveUser,
    @Res() res: Response,
  ) {
    const annee = parseInt(anneeStr, 10);
    if (!Number.isFinite(annee) || annee < 2000 || annee > 2100) {
      throw new BadRequestException('Année invalide.');
    }

    // Régénère systématiquement pour avoir des données à jour
    const doc = await this.generateUseCase.execute(user.userId, annee);
    if (doc.montantBrut === 0 && doc.montantNet === 0) {
      throw new NotFoundException(
        `Aucune distribution reçue en ${annee} — pas d'IFU à générer.`,
      );
    }

    // Deux lectures, jamais imbriquées dans le stream : le compte pour l'état
    // civil, le profil pour l'identification fiscale. Le profil peut être
    // absent (personne morale, onboarding inachevé) — le PDF s'imprime alors
    // sans les deux lignes correspondantes, jamais avec des lignes vides.
    const [userEntity, profil] = await Promise.all([
      this.userRepo.findById(user.userId),
      this.profilRepo.findProfilPPByUserId(user.userId),
    ]);
    this.pdfService.streamToResponse(
      doc,
      {
        userId: user.userId,
        firstName: userEntity?.firstname ?? null,
        lastName: userEntity?.lastname ?? null,
        email: userEntity?.email ?? null,
        residenceFiscale: profil?.residenceFiscale ?? null,
        nif: profil?.nif ?? null,
      },
      res,
    );
  }
}
