import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { ConflitsInteretsService } from './conflits-interets.service';
import { ConflitsInteretsErrorFilter } from 'src/projects/presenters/http/filters/conflits-interets-error.filter';

/**
 * Module transverse des conflits d'intérêts.
 *
 * La règle D5 — un porteur n'investit pas dans son propre projet — est branchée
 * sur sept portes d'entrée réparties dans quatre modules métier (souscription,
 * réservation, marché secondaire, projets). Un service déclaré dans chacun
 * d'eux donnerait sept instances et, tôt ou tard, sept comportements.
 *
 * Ce module n'importe QUE des modules d'infrastructure — des feuilles du
 * graphe de dépendances — de sorte qu'il puisse être importé partout sans
 * jamais créer de cycle.
 *
 * Il enregistre aussi le filtre d'erreurs en `APP_FILTER` (donc globalement) :
 * un `@UseFilters` à poser sur chaque contrôleur concerné aurait fait du
 * premier oubli un 500 sur un refus métier parfaitement normal.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ProfilPPEntity]),
    ProjectsInfrastructureModule,
    InvestmentsInfrastructureModule,
  ],
  providers: [
    ConflitsInteretsService,
    { provide: APP_FILTER, useClass: ConflitsInteretsErrorFilter },
  ],
  exports: [ConflitsInteretsService],
})
export class ConflitsInteretsModule {}
