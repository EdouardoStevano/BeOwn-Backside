import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { DeclarerBeneficiaireUseCase } from '../../application/usecases/beneficiaires/declarer-beneficiaire.usecase';
import { ConsulterRegistreUseCase } from '../../application/usecases/beneficiaires/consulter-registre.usecase';
import { RetirerBeneficiaireUseCase } from '../../application/usecases/beneficiaires/retirer-beneficiaire.usecase';
import { CreateBeneficiaireEffectifDto } from './dto/beneficiaire-effectif.dto';

/**
 * Les bénéficiaires effectifs d'une société — les personnes qui la contrôlent
 * réellement.
 *
 * Le cahier des charges les définit comme *« les actionnaires possédant 25 % et
 * plus des parts de la société de manière directe ou indirecte »*, à déclarer
 * par un formulaire DBE-S1 accompagné d'une pièce d'identité par personne.
 *
 * **Ce contrôleur ne connaît plus la base.** Il injectait
 * `Repository<BeneficiaireEffectifEntity>` et faisait `create` / `save` /
 * `delete` lui-même : la couche de présentation portait la persistance, le
 * contrôle d'appartenance et — par les décorateurs du DTO — les seules règles
 * métier écrites (§14, §27). Elles vivent désormais dans
 * `RegistreDesBeneficiaires` et `BeneficiaireEffectif`, où elles s'éprouvent
 * sans simuler une requête HTTP, et où un import ou un script les rencontre
 * aussi.
 *
 * La **pièce d'identité** de chaque bénéficiaire ne se dépose pas ici : elle
 * passe par `POST /profiles/pm/:societeId/pieces` avec le type
 * `piece_identite_beneficiaire`, qui lui donne un statut d'instruction et un
 * motif de refus — ce que l'ancien champ `pieceIdentiteDocId`, jamais lu, ne
 * pouvait pas porter.
 */
@ApiTags('Profiles — Bénéficiaires Effectifs (DBE-S1)')
@ApiBearerAuth()
@Controller('profiles/pm/me/beneficiaires')
@UseGuards(JwtAuthGuard)
export class BeneficiaireEffectifController {
  constructor(
    private readonly declarerBeneficiaire: DeclarerBeneficiaireUseCase,
    private readonly consulterRegistre: ConsulterRegistreUseCase,
    private readonly retirerBeneficiaire: RetirerBeneficiaireUseCase,
  ) {}

  @ApiOperation({
    summary: "Lister les bénéficiaires effectifs (>25%) d'une de mes sociétés",
    description:
      'Rend les déclarations et le total des parts détenues en direct — celui ' +
      'qui ne peut pas dépasser 100 %.',
  })
  @ApiQuery({ name: 'pmId', description: 'UUID du profil PM' })
  @ApiResponse({ status: 200, description: 'Registre retourné' })
  @ApiResponse({ status: 404, description: 'Société introuvable' })
  @Get()
  lister(@CurrentUser() user: ActiveUser, @Query('pmId') pmId: string) {
    return this.consulterRegistre.execute(user.userId, pmId);
  }

  @ApiOperation({
    summary: 'Déclarer un bénéficiaire effectif sur une de mes sociétés',
  })
  @ApiResponse({ status: 201, description: 'Registre mis à jour' })
  @ApiResponse({
    status: 400,
    description: 'Part inférieure à 25 %, ou donnée déclarée invalide',
  })
  @ApiResponse({
    status: 409,
    description: 'Les détentions directes dépasseraient 100 % du capital',
  })
  @Post()
  declarer(
    @CurrentUser() user: ActiveUser,
    @Body() dto: CreateBeneficiaireEffectifDto,
  ) {
    const { pmId, ...champs } = dto;
    return this.declarerBeneficiaire.execute(user.userId, pmId, champs);
  }

  @ApiOperation({
    summary: "Retirer un bénéficiaire effectif d'une de mes sociétés",
    description:
      "La pièce d'identité déposée pour cette personne n'est pas supprimée : " +
      'sa conservation de cinq ans survit à la correction d’un registre.',
  })
  @ApiParam({ name: 'id', description: 'UUID du bénéficiaire' })
  @ApiQuery({ name: 'pmId', description: 'UUID du profil PM' })
  @ApiResponse({ status: 200, description: 'Registre mis à jour' })
  @ApiResponse({ status: 404, description: 'Bénéficiaire introuvable' })
  @Delete(':id')
  retirer(
    @CurrentUser() user: ActiveUser,
    @Param('id') id: string,
    @Query('pmId') pmId: string,
  ) {
    return this.retirerBeneficiaire.execute(user.userId, pmId, id);
  }
}
