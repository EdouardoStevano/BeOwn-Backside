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
 * ## Le filtre d'erreurs : `APP_FILTER` ne suffit PAS
 *
 * Ce module enregistre `ConflitsInteretsErrorFilter` en `APP_FILTER`, mais
 * c'est un FILET, pas la garantie. `main.ts` pose
 * `app.useGlobalFilters(new SentryExceptionFilter(...))` — un `@Catch()`
 * attrape-tout — APRÈS l'initialisation des modules ; Nest assemble les
 * filtres `[globaux, contrôleur, méthode]`, inverse la liste, puis retient le
 * premier dont le `@Catch()` accepte l'exception. L'attrape-tout enregistré en
 * dernier passe donc AVANT cet `APP_FILTER`, et rend 500.
 *
 * Constaté en recette : les refus de conflit d'intérêts sortaient en 500 alors
 * que la règle fonctionnait (refus journalisé, rien créé, `audit_log` à 403).
 * Le module IAM avait rencontré le même piège et documenté sa parade.
 *
 * La traduction est donc garantie par un `@UseFilters(ConflitsInteretsErrorFilter)`
 * de portée CONTRÔLEUR — les filtres de contrôleur passent toujours avant les
 * globaux — sur les quatre contrôleurs qui exposent un flux gardé. Deux tests
 * tiennent cette mécanique :
 *  - `conflits-interets-statut-http.spec.ts` lit le statut réellement rendu par
 *    l'application assemblée, filtre Sentry compris ;
 *  - `conflits-interets-completude.spec.ts` échoue si un contrôleur consommant
 *    un use case gardé oublie le filtre.
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
