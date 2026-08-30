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
import { DeciderPieceUseCase } from 'src/onboarding/application/usecases/pieces/decider-piece.usecase';
import { DeciderPieceDto } from './dto/piece-justificative.dto';

/**
 * Instruction des pièces justificatives par l'équipe conformité.
 *
 * **C'est le maillon que le cahier des charges confie au PSP** — « les
 * documents sont automatiquement envoyés au PSP pour validation ». Aucun
 * contrat d'API ne le permet aujourd'hui : Stripe Connect vérifie ses comptes
 * Express par son propre parcours hébergé, il n'accepte pas qu'on lui pousse
 * des pièces. La décision est donc humaine, comme l'est déjà la revue manuelle
 * du KYC, et ces routes sont gardées par la même permission —
 * `kyc:validate` — parce que c'est le même métier et la même équipe.
 *
 * Le jour où le contrat existe, l'adaptateur appelle `DeciderPieceUseCase` à la
 * place de l'administrateur : les règles ne bougent pas, seule la main change.
 */
@ApiTags('Admin — Pièces justificatives')
@ApiBearerAuth()
@Controller('admin/compliance/societes/:societeId/pieces')
@UseGuards(JwtAuthGuard)
@RequirePermission('kyc:validate')
export class AdminPieceJustificativeController {
  constructor(private readonly deciderPiece: DeciderPieceUseCase) {}

  @ApiOperation({ summary: 'Accepter une pièce justificative' })
  @ApiParam({
    name: 'societeId',
    description: 'UUID du profil personne morale',
  })
  @ApiParam({ name: 'pieceId', description: 'UUID de la pièce' })
  @ApiResponse({ status: 200, description: 'Pièce acceptée' })
  @ApiResponse({
    status: 404,
    description: 'Pièce introuvable dans ce dossier',
  })
  @Patch(':pieceId/accepter')
  accepter(
    @Param('societeId') societeId: string,
    @Param('pieceId') pieceId: string,
  ) {
    return this.deciderPiece.accepter(societeId, pieceId);
  }

  @ApiOperation({
    summary: 'Refuser une pièce justificative',
    description:
      'Le motif est obligatoire : c’est lui qui part au titulaire et qui lui ' +
      'dit quoi corriger. Redéposer la pièce remet son instruction en attente.',
  })
  @ApiParam({
    name: 'societeId',
    description: 'UUID du profil personne morale',
  })
  @ApiParam({ name: 'pieceId', description: 'UUID de la pièce' })
  @ApiResponse({
    status: 200,
    description: 'Pièce refusée ; titulaire notifié',
  })
  @ApiResponse({ status: 400, description: 'Motif de refus manquant' })
  @Patch(':pieceId/refuser')
  refuser(
    @Param('societeId') societeId: string,
    @Param('pieceId') pieceId: string,
    @Body() dto: DeciderPieceDto,
  ) {
    // Le domaine refuse déjà un motif vide (`DecisionPiece.refusee`) ; la
    // vérification est reprise ici pour que le corps soit rejeté avant d'avoir
    // chargé le dossier, et pour que Swagger annonce la contrainte.
    if (!dto.motif?.trim()) {
      throw new BadRequestException(
        'Le motif de refus est obligatoire : le titulaire doit savoir quoi corriger.',
      );
    }

    return this.deciderPiece.refuser(societeId, pieceId, dto.motif);
  }
}
