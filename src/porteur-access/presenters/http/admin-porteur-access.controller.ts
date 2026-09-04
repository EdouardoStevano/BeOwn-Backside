import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { AuditSansCorps } from 'src/common/audit/audit-sans-corps.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { DemandeAccesPorteurReader } from 'src/porteur-access/applications/ports/demande-acces-porteur.repository';
import { InstruireDemandePorteurUseCase } from 'src/porteur-access/applications/usecases/instruire-demande-porteur.usecase';
import {
  DeciderDemandePorteurUseCase,
  type DecisionDemandeAccesPorteur,
} from 'src/porteur-access/applications/usecases/decider-demande-porteur.usecase';
import {
  SEUIL_ALERTE_INSTRUCTION_JOURS,
  StatutDemandeAccesPorteur,
} from 'src/porteur-access/domains/demande-acces-porteur';
import { LIBELLES_MOTIF_REFUS } from 'src/porteur-access/domains/motif-refus';
import {
  DeciderDemandeAccesPorteurDto,
  ListerDemandesAccesPorteurDto,
} from '../dto/porteur-access.dto';
import { PorteurAccessErrorFilter } from './filters/porteur-access-error.filter';
import { versVueInstructeur } from './demande-acces-porteur.presenter';

/**
 * File de traitement des demandes d'accès porteur — back-office.
 *
 * Une seule permission garde tout le contrôleur : `porteur_access:review`,
 * accordée à `compliance` (et à `super_admin` par le joker). Elle est
 * DISTINCTE de `users:manage` : accorder l'espace porteur ouvre la soumission
 * de projets et la trésorerie d'un projet, ce n'est pas éditer une fiche.
 *
 * Toute décision laisse une entrée d'audit métier explicite (écrite par le use
 * case, avec l'état ANTÉRIEUR du drapeau — que l'AuditInterceptor global ne
 * peut pas connaître) et est imputée à l'administrateur appelant : aucune
 * décision n'est rendue de façon entièrement automatisée.
 *
 * `@AuditSansCorps()` : le corps du PATCH porte `motifRefusComplement`, texte
 * libre interne sur une personne. Il ne doit pas être recopié dans
 * `audit_log` (cinq ans, hors purge, hors export) ; l'entrée métier du use
 * case retient le motif CODÉ, qui suffit à relire la décision.
 */
@ApiTags('Admin — Accès porteur')
@ApiBearerAuth()
@Controller('admin/porteur-access')
@UseGuards(JwtAuthGuard)
@RequirePermission('porteur_access:review')
@UseFilters(PorteurAccessErrorFilter)
@AuditSansCorps()
export class AdminPorteurAccessController {
  constructor(
    private readonly lecture: DemandeAccesPorteurReader,
    private readonly instruire: InstruireDemandePorteurUseCase,
    private readonly decider: DeciderDemandePorteurUseCase,
  ) {}

  @ApiOperation({
    summary:
      "File des demandes d'accès porteur (paginée, filtrable par statut)",
    description:
      "Chaque ligne porte `alerteInstructionLe` (J+25) et `enAlerte` : de quoi remonter les dossiers qui approchent de l'engagement de réponse à 30 jours annoncé par les CGU.",
  })
  @Get('demandes')
  async lister(@Query() query: ListerDemandesAccesPorteurDto) {
    const page = await this.lecture.lister({
      statut: query.statut,
      page: query.page,
      limit: query.limit,
    });
    const maintenant = new Date();
    return {
      ...page,
      items: page.items.map((d) => versVueInstructeur(d, maintenant)),
      // Référentiels rendus au back-office : la liste fermée des motifs et le
      // seuil d'alerte viennent du serveur, l'écran ne les recopie pas.
      motifsRefus: LIBELLES_MOTIF_REFUS,
      seuilAlerteJours: SEUIL_ALERTE_INSTRUCTION_JOURS,
    };
  }

  @ApiOperation({
    summary: 'Instruire ou décider une demande',
    description:
      "`en_examen` prend le dossier en charge ; `acceptee` ouvre l'accès porteur (le rôle investisseur est CONSERVÉ) et invalide la session de la cible ; `refusee` exige un motif codé de la liste fermée, dont seul le libellé est communiqué au demandeur.",
  })
  @ApiResponse({ status: 200, description: 'Demande mise à jour' })
  @ApiResponse({
    status: 400,
    description: 'Motif de refus manquant ou hors liste',
  })
  @ApiResponse({ status: 404, description: 'Demande introuvable' })
  @ApiResponse({ status: 409, description: 'Transition interdite' })
  @Patch('demandes/:id')
  async statuer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeciderDemandeAccesPorteurDto,
    @CurrentUser() admin: ActiveUser,
  ) {
    const decideurRole = admin.role ?? UserRole.COMPLIANCE;

    // Aiguillage, pas règle métier : la prise en charge et la décision sont
    // deux use cases distincts (la première ne touche pas à `porteurAccess`,
    // ne notifie pas et ne coupe aucune session). Deux branches, et le jeu
    // est CLOS — la machine à états du domaine ne connaît pas d'autre acte
    // d'instructeur, un troisième cas ne peut donc pas apparaître ici sans
    // apparaître d'abord dans `TRANSITIONS_LEGALES`.
    if (dto.decision === StatutDemandeAccesPorteur.EN_EXAMEN) {
      const demande = await this.instruire.execute({
        demandeId: id,
        decideurAdminId: admin.userId,
        decideurRole,
      });
      return { demande: versVueInstructeur(demande) };
    }

    const resultat = await this.decider.execute({
      demandeId: id,
      decision: dto.decision as DecisionDemandeAccesPorteur,
      motifRefus: dto.motifRefus ?? null,
      motifRefusComplement: dto.motifRefusComplement ?? null,
      // L'identité de l'administrateur vient du JWT, jamais du corps : c'est
      // ce qui rend la décision imputable à un humain.
      decideurAdminId: admin.userId,
      decideurRole,
    });

    return {
      demande: versVueInstructeur(resultat.demande),
      porteurAccess: resultat.porteurAccess,
      sessionInvalidee: resultat.sessionInvalidee,
    };
  }
}
