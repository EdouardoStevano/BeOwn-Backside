import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Public } from 'src/common/auth/public.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { Inject, ParseUUIDPipe } from '@nestjs/common';
import { AVIS_REPOSITORY } from 'src/avis/applications/ports/repositories/avis.repository';
import type { AvisRepository } from 'src/avis/applications/ports/repositories/avis.repository';
import { Avis } from 'src/avis/domains/avis';
import {
  type AvisPublic,
  projeterAvisPublics,
} from 'src/avis/domains/avis-public';
import { PROJECT_REPOSITORY } from 'src/projects/applications/ports/repositories/project.repository';
import type { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { STATUTS_PROJET_AVIS_PUBLICS } from 'src/projects/domains/enums/project-status.enum';
import { CreateAvisDto } from '../dto/avis.dto';
import { Throttle } from '@nestjs/throttler';

/**
 * Palier des écritures d'avis. Dix par minute : personne ne rédige dix avis
 * dans la minute, et c'est très en dessous de ce qu'exige un dépôt d'avis
 * automatisé.
 */
const DEBIT_ECRITURE_AVIS = {
  short: { ttl: 60_000, limit: 10 },
  medium: { ttl: 60_000, limit: 10 },
  // Pas de surcharge `auth` : resserrer ce palier vaut déclaration « sensible
  // au bourrage d'identifiants » et bascule la route en fail-closed sur panne
  // Redis (cf. RedisThrottlerStorage). Poster un avis n'est pas de cet ordre ;
  // le filet global `auth` (500/15 min, fail-open) continue de s'appliquer.
} as const;

/**
 * Palier des lectures, dont DEUX sont publiques (`@Public()`) : la liste des
 * avis d'un projet et ses statistiques.
 *
 * Ce contrôleur portait un `@SkipThrottle()` de classe, c'est-à-dire une
 * déclaration d'intention de ne PAS limiter des routes non authentifiées,
 * adressables par identifiant de projet et sans cache. Deux raisons de le
 * remplacer par un palier explicite :
 *
 *  1. l'intention elle-même était mauvaise sur des routes publiques — c'est
 *    l'aspiration des avis et la saturation de la base par un seul appelant
 *    qui devenaient gratuites ;
 *  2. il ne faisait de toute façon RIEN. Vérifié dans @nestjs/throttler 6.5.0 :
 *    un `@SkipThrottle()` sans argument n'inscrit que la clé `default`, que le
 *    guard ne lit jamais puisqu'il n'interroge que les throttlers déclarés
 *    (`short`, `medium`, `auth`). Ces routes tombaient donc sur les limites
 *    globales — larges (500/s, 2000/min) et jamais choisies pour elles.
 *
 * Soixante lectures par minute couvrent largement la consultation d'une fiche
 * projet (deux appels par affichage), y compris derrière un NAT d'entreprise.
 */
const DEBIT_LECTURE_AVIS = {
  short: { ttl: 60_000, limit: 60 },
  medium: { ttl: 60_000, limit: 60 },
  // Pas de surcharge `auth` — même raison que DEBIT_ECRITURE_AVIS, et à plus
  // forte raison : deux de ces routes sont publiques, une panne Redis ne doit
  // pas rendre les avis illisibles sur les fiches projets.
} as const;

@Throttle(DEBIT_LECTURE_AVIS)
@ApiTags('Avis')
@ApiBearerAuth()
@Controller('avis')
@UseGuards(JwtAuthGuard)
export class AvisController {
  constructor(
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  @ApiOperation({ summary: 'Soumettre un avis sur un projet' })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 201, description: 'Avis enregistré' })
  @ApiResponse({ status: 409, description: 'Avis déjà soumis pour ce projet' })
  @ApiResponse({ status: 429, description: 'Trop de demandes — 10 par minute' })
  @Throttle(DEBIT_ECRITURE_AVIS)
  @Post('projet/:projetId')
  async create(
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const existing = await this.avisRepository.findByUserAndProjet(user.userId, projetId);
    if (existing) {
      throw new ConflictException('Vous avez déjà soumis un avis pour ce projet.');
    }

    const avis = new Avis();
    avis.projetId = projetId;
    avis.userId = user.userId;
    avis.note = dto.note;
    avis.commentaire = dto.commentaire ?? null;

    return this.avisRepository.save(avis);
  }

  @ApiOperation({ summary: "Mettre à jour son avis sur un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Avis mis à jour' })
  @ApiResponse({ status: 429, description: 'Trop de demandes — 10 par minute' })
  @Throttle(DEBIT_ECRITURE_AVIS)
  @Post('projet/:projetId/update')
  async update(
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const existing = await this.avisRepository.findByUserAndProjet(user.userId, projetId);
    if (!existing) {
      throw new NotFoundException("Aucun avis trouvé. Utilisez POST /avis/projet/:projetId pour en créer un.");
    }

    existing.note = dto.note;
    existing.commentaire = dto.commentaire ?? null;

    return this.avisRepository.save(existing);
  }

  @ApiOperation({ summary: "Avis de l'utilisateur sur un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Avis de cet utilisateur ou null' })
  @Get('projet/:projetId/me')
  async getMyAvis(
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.avisRepository.findByUserAndProjet(user.userId, projetId);
  }

  /**
   * Deux corrections par rapport à la version publique précédente :
   *
   *  1. Le projet doit être PUBLIÉ. La route servait les avis de n'importe
   *     quel projet désigné par son UUID — brouillon, refusé, archivé —, alors
   *     que `GET /projects/:id/avis` filtrait déjà : deux portes sur la même
   *     donnée, une seule fermée. La seconde devient un oracle d'existence sur
   *     des projets non publiés.
   *  2. L'auteur est ANONYMISÉ. La liste sortait `userId`, prénom et nom
   *     complet — voir `projeterAvisPublic`.
   */
  @ApiOperation({ summary: "Liste des avis d'un projet publié (accès public)" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des avis, auteurs anonymisés' })
  @ApiResponse({ status: 404, description: 'Projet inexistant ou non publié' })
  @Public()
  @Get('projet/:projetId')
  async getByProjet(
    @Param('projetId', ParseUUIDPipe) projetId: string,
  ): Promise<AvisPublic[]> {
    await this.assertProjetPublie(projetId);
    return projeterAvisPublics(await this.avisRepository.findByProjetId(projetId));
  }

  @ApiOperation({ summary: 'Statistiques des avis d\'un projet (accès public)' })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Note moyenne et nombre d\'avis' })
  @ApiResponse({ status: 404, description: 'Projet inexistant ou non publié' })
  @Public()
  @Get('projet/:projetId/stats')
  async getStats(@Param('projetId', ParseUUIDPipe) projetId: string) {
    await this.assertProjetPublie(projetId);
    return this.avisRepository.getStats(projetId);
  }

  /**
   * Même périmètre que `GET /projects/:id/avis` : seuls les projets réellement
   * exposés au public ont des avis publics. Un projet inexistant et un projet
   * non publié rendent la MÊME 404, pour ne rien dire de l'un ni de l'autre.
   */
  private async assertProjetPublie(projetId: string): Promise<void> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet || !STATUTS_PROJET_AVIS_PUBLICS.includes(projet.statut)) {
      throw new NotFoundException('Projet introuvable.');
    }
  }
}
