import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { DeciderKybUseCase } from 'src/onboarding/application/usecases/kyb/decider-kyb.usecase';
import { RefuserKybDto, ValiderKybDto } from './dto/kyb.dto';

/**
 * Instruction du dossier KYB d'une société par l'équipe conformité.
 *
 * **Distinct de l'instruction des pièces**, et les deux ne se remplacent pas :
 * `AdminPieceJustificativeController` tranche document par document — « ce KBIS
 * est illisible » —, celui-ci tranche le dossier entier une fois qu'ils sont
 * tous réunis. C'est ce second verdict qui décide si la société peut souscrire,
 * et lui seul est daté et signé.
 *
 * Même permission que les pièces et que la revue manuelle du KYC —
 * `kyc:validate` — parce que c'est la même équipe et le même métier.
 *
 * **Ces routes sont le seul chemin par lequel un KYB se valide.** Le KYC d'une
 * personne physique, lui, est tranché automatiquement par Stripe Identity ; une
 * société n'a pas d'équivalent — Stripe Connect vérifie le compte du
 * représentant légal, pas les sociétés qu'il déclare. L'instruction du dossier
 * moral est donc humaine par conception, et non faute d'automatisation.
 *
 * **Un dossier ne s'instruit que s'il est complet.** Le domaine le refuse
 * autrement (`KybPasEnInstructionError` → 409), et c'est délibérément là et non
 * ici : la règle doit valoir pour tout appelant, y compris un script de reprise
 * ou une console d'administration qui court-circuiterait cette route.
 */
@ApiTags('Admin — Dossier KYB')
@ApiBearerAuth()
@Controller('admin/compliance/societes/:societeId/kyb')
@UseGuards(JwtAuthGuard)
@RequirePermission('kyc:validate')
export class AdminKybController {
  constructor(private readonly deciderKyb: DeciderKybUseCase) {}

  @ApiOperation({
    summary: 'Valider le dossier KYB d’une société',
    description:
      'Rend la société apte à réaliser des opérations financières, sous ' +
      'réserve que le KYC de son représentant légal soit lui-même validé — ' +
      'une personne morale ne signe pas elle-même.',
  })
  @ApiParam({
    name: 'societeId',
    description: 'UUID du profil personne morale',
  })
  @ApiResponse({
    status: 200,
    description: 'Dossier validé ; titulaire notifié',
  })
  @ApiResponse({ status: 404, description: 'Société introuvable' })
  @ApiResponse({
    status: 409,
    description:
      'Le dossier n’est pas en instruction : il lui manque des justificatifs, ' +
      'ou il a déjà été tranché.',
  })
  @Patch('valider')
  valider(
    @Param('societeId') societeId: string,
    @Body() dto: ValiderKybDto,
    @CurrentUser() admin: ActiveUser,
  ) {
    return this.deciderKyb.valider(
      societeId,
      dto.valideJusquAu ?? null,
      admin.userId,
    );
  }

  @ApiOperation({
    summary: 'Refuser le dossier KYB d’une société',
    description:
      'À utiliser quand le dossier est complet mais ne tient pas — registre ' +
      'des bénéficiaires qui ne recoupe pas les statuts, actionnariat ' +
      'incohérent. Pour un document isolé, refuser la pièce plutôt que le ' +
      'dossier : le titulaire saura lequel reprendre.',
  })
  @ApiParam({
    name: 'societeId',
    description: 'UUID du profil personne morale',
  })
  @ApiResponse({
    status: 200,
    description: 'Dossier refusé ; titulaire notifié',
  })
  @ApiResponse({ status: 400, description: 'Motif de refus manquant' })
  @ApiResponse({
    status: 409,
    description: 'Le dossier n’est pas en instruction',
  })
  @Patch('refuser')
  refuser(
    @Param('societeId') societeId: string,
    @Body() dto: RefuserKybDto,
    @CurrentUser() admin: ActiveUser,
  ) {
    // Rejeté avant d'avoir chargé quoi que ce soit, et annoncé par Swagger.
    // Le motif est la seule chose que le titulaire lira d'un dossier écarté
    // dont toutes les pièces avaient été acceptées.
    if (!dto.motif?.trim()) {
      throw new BadRequestException(
        'Le motif de refus est obligatoire : le titulaire doit savoir quoi corriger.',
      );
    }

    return this.deciderKyb.refuser(societeId, dto.motif, admin.userId);
  }
}
