import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { EnregistrerDocumentClesUseCase } from 'src/projects/applications/usecases/enregistrer-document-cles.usecase';
import { ConsulterDocumentClesUseCase } from 'src/projects/applications/usecases/consulter-document-cles.usecase';
import {
  AVERTISSEMENTS,
  LANGUE_ATTENDUE,
  MARQUEUR_RESPONSABILITE_ASSOCIES,
  NOMBRE_MAX_PAGES,
  rendreSections,
} from 'src/projects/domains/fici';
import { FiciDto, VerdictFiciDto } from '../dto/fici.dto';

/**
 * Gabarit du document : ordre, intitulés, aide à la saisie et avertissements.
 * Servi par l'API pour qu'aucune interface ne recopie ces textes — ils
 * relèvent du gabarit de conformité, pas des écrans.
 */
function gabarit() {
  return {
    nombreMaxPages: NOMBRE_MAX_PAGES,
    langueAttendue: LANGUE_ATTENDUE,
    sections: rendreSections(null).map(({ cle, intitule, ordre, aide }) => ({
      cle,
      intitule,
      ordre,
      aide,
    })),
    avertissements: AVERTISSEMENTS,
    marqueurResponsabiliteAssocies: MARQUEUR_RESPONSABILITE_ASSOCIES,
  };
}

@ApiTags("Document d'informations clés")
@Controller('projets')
export class DocumentClesController {
  constructor(private readonly consulter: ConsulterDocumentClesUseCase) {}

  @ApiOperation({
    summary:
      "Gabarit du document d'informations clés (sections, intitulés, avertissements)",
    description:
      "Source unique de l'ordre des sections, de leurs intitulés, de l'aide à la saisie et des avertissements. Aucune interface ne doit recopier ces textes.",
  })
  @ApiResponse({ status: 200, description: 'Gabarit du document' })
  @Public()
  @Get('document-cles/gabarit')
  lireGabarit() {
    return gabarit();
  }

  @ApiOperation({
    summary: "Document d'informations clés d'une opération (public)",
    description:
      "Sert le document des opérations sorties du brouillon et effectivement dotées d'un document. Un brouillon renvoie 404, même si son slug est connu.",
  })
  @ApiParam({ name: 'slug', example: 'residence-les-jardins' })
  @ApiResponse({ status: 200, description: 'Document servi' })
  @ApiResponse({
    status: 404,
    description: 'Opération introuvable, en brouillon, ou sans document publié',
  })
  @Public()
  @Get(':slug/document-cles')
  lirePublic(@Param('slug') slug: string) {
    return this.consulter.pourPublic(slug);
  }
}

@ApiTags("Admin — Document d'informations clés")
@ApiBearerAuth()
@Controller('admin/projets')
export class AdminDocumentClesController {
  constructor(
    private readonly enregistrer: EnregistrerDocumentClesUseCase,
    private readonly consulter: ConsulterDocumentClesUseCase,
  ) {}

  @ApiOperation({
    summary: "Gabarit du document d'informations clés (saisie Admin)",
  })
  @ApiResponse({ status: 200, description: 'Gabarit du document' })
  @RequirePermission('projects:read')
  @Get('document-cles/gabarit')
  lireGabarit() {
    return gabarit();
  }

  @ApiOperation({
    summary: "Document d'informations clés d'un projet, complet ou non",
    description:
      "Sert le document tel qu'il est enregistré, avec le verdict de complétude section par section. Contrairement à la route publique, un brouillon est servi : c'est l'écran de saisie.",
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Document et verdict' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @RequirePermission('projects:read')
  @Get(':id/document-cles')
  lireAdmin(@Param('id') id: string) {
    return this.consulter.pourAdmin(id);
  }

  @ApiOperation({
    summary: "Enregistrer le document d'informations clés d'un projet",
    description:
      "Écrase la version courante. Un contenu incomplet est refusé en 400 avec le verdict détaillé et RIEN n'est enregistré. Le numéro et la date de version sont posés par le serveur.",
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiBody({ type: FiciDto })
  @ApiResponse({ status: 200, description: 'Document enregistré' })
  @ApiResponse({
    status: 400,
    description: 'Document incomplet ou non conforme',
    type: VerdictFiciDto,
  })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Put(':id/document-cles')
  async ecrire(@Param('id') id: string, @Body() dto: FiciDto) {
    await this.enregistrer.execute({
      projetId: id,
      sections: dto.sections,
      nombrePages: dto.nombrePages,
      langue: dto.langue,
    });
    return this.consulter.pourAdmin(id);
  }
}
