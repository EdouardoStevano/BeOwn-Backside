import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { AuditSansCorps } from 'src/common/audit/audit-sans-corps.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { DemandeAccesPorteurReader } from 'src/porteur-access/applications/ports/demande-acces-porteur.repository';
import { SoumettreDemandePorteurUseCase } from 'src/porteur-access/applications/usecases/soumettre-demande-porteur.usecase';
import { RetirerDemandePorteurUseCase } from 'src/porteur-access/applications/usecases/retirer-demande-porteur.usecase';
import {
  DELAI_REPONSE_INDICATIF_JOURS,
  MOTIVATION_LONGUEUR_MAX,
} from 'src/porteur-access/domains/demande-acces-porteur';
import { SoumettreDemandeAccesPorteurDto } from '../dto/porteur-access.dto';
import { PorteurAccessErrorFilter } from './filters/porteur-access-error.filter';
import { versVueDemandeur } from './demande-acces-porteur.presenter';

/**
 * Parcours « demander l'accès porteur », côté investisseur.
 *
 * Les CGU (« l'inscription en ligne ne permet pas de devenir Porteur », statut
 * « attribué par BeOwn après examen ») interdisent tout octroi en libre-service :
 * ce contrôleur ouvre un dossier, il n'accorde rien. La décision vit dans
 * `AdminPorteurAccessController`, sous la permission `porteur_access:review`.
 *
 * `@Roles(INVESTISSEUR)` : un porteur « pur » n'a rien à demander, et le
 * back-office non plus. Le rôle ne fait qu'ouvrir la porte du parcours — les
 * règles d'éligibilité (accès déjà ouvert, demande en cours, délai de
 * carence) sont relues EN BASE par le use case.
 *
 * `@AuditSansCorps()` : la motivation est du texte libre écrit par la
 * personne. L'intercepteur d'audit global la recopierait dans `audit_log`,
 * conservé cinq ans, hors barème de purge et hors export RGPD. La trace reste
 * complète (acteur, route, statut) et le use case écrit sa propre entrée
 * métier — avec la LONGUEUR de la motivation, jamais son texte.
 *
 * Le contrôleur ne contient AUCUNE règle : il traduit HTTP ↔ use case, et
 * délègue la mise en forme au présentateur.
 */
@ApiTags('Accès porteur')
@ApiBearerAuth()
@Controller('porteur-access')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.INVESTISSEUR)
@UseFilters(PorteurAccessErrorFilter)
@AuditSansCorps()
export class PorteurAccessController {
  constructor(
    private readonly soumettre: SoumettreDemandePorteurUseCase,
    private readonly retirer: RetirerDemandePorteurUseCase,
    // Lecture seule : ce contrôleur n'injecte PAS le port d'écriture, il ne
    // peut donc pas modifier une demande hors des deux use cases ci-dessus.
    private readonly lecture: DemandeAccesPorteurReader,
  ) {}

  @ApiOperation({
    summary: "Demander l'ouverture de l'espace porteur",
    description:
      "Ouvre un dossier instruit par BeOwn. Le compte CONSERVE son rôle investisseur ; en cas d'acceptation il gagne un accès porteur cumulé. Aucune décision n'est automatisée.",
  })
  @ApiResponse({ status: 201, description: 'Demande enregistrée' })
  @ApiResponse({ status: 400, description: 'Motivation hors bornes' })
  @ApiResponse({ status: 403, description: 'Rôle non éligible' })
  @ApiResponse({
    status: 409,
    description: 'Accès déjà ouvert, ou demande déjà en cours',
  })
  @ApiResponse({ status: 429, description: 'Délai de carence après un refus' })
  // Palier de débit resserré : instruire coûte du temps humain. Le délai de
  // carence après refus (30 j) est, lui, une règle MÉTIER portée par le use
  // case — celui-ci ne protège que l'infrastructure.
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 3_600_000, limit: 10 },
  })
  @Post('demandes')
  async soumettreDemande(
    @CurrentUser() user: ActiveUser,
    @Body() dto: SoumettreDemandeAccesPorteurDto,
  ) {
    const demande = await this.soumettre.execute({
      utilisateurId: user.userId,
      motivation: dto.motivation,
    });
    return versVueDemandeur(demande);
  }

  @ApiOperation({
    summary: 'Ma demande en cours et mon historique',
    description:
      "`derniere` est la demande la plus récente (null si le compte n'en a jamais déposé) ; `historique` les liste de la plus récente à la plus ancienne. L'identifiant de l'instructeur et ses notes internes ne sont jamais restitués.",
  })
  @Get('demandes/me')
  async mesDemandes(@CurrentUser() user: ActiveUser) {
    const historique = await this.lecture.historique(user.userId);
    return {
      derniere: historique.length > 0 ? versVueDemandeur(historique[0]) : null,
      historique: historique.map(versVueDemandeur),
      // Contrat affiché au demandeur, aligné sur les CGU.
      delaiReponseIndicatifJours: DELAI_REPONSE_INDICATIF_JOURS,
      motivationLongueurMax: MOTIVATION_LONGUEUR_MAX,
    };
  }

  @ApiOperation({
    summary: "Retirer ma demande, tant qu'aucune décision n'est rendue",
  })
  @ApiResponse({ status: 403, description: "Demande d'un autre compte" })
  @ApiResponse({ status: 404, description: 'Demande introuvable' })
  @ApiResponse({ status: 409, description: 'Demande déjà décidée' })
  @Patch('demandes/:id/retrait')
  async retirerDemande(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const demande = await this.retirer.execute({
      demandeId: id,
      utilisateurId: user.userId,
    });
    return versVueDemandeur(demande);
  }
}
