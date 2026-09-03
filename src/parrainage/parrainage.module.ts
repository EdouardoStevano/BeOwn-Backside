import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ParrainageAttributionEntity } from './infrastructure/persistences/entities/parrainage-attribution.entity';
import { AssurerCodeParrainageService } from './applications/assurer-code-parrainage.service';
import { AttribuerBonusParrainageService } from './applications/attribuer-bonus-parrainage.service';
import { RattacherFilleulService } from './applications/rattacher-filleul.service';
import { ParrainageController } from './presenters/http/parrainage.controller';

/**
 * Programme de parrainage (vague C — benchmark concurrentiel).
 *
 * Le module EXPORTE ses deux services : l'inscription (IamModule) pose le
 * code et le lien de parrainage, la confirmation d'investissement
 * (InvestmentsModule — cron de fin de délai ET confirmation immédiate des
 * avertis) déclenche l'attribution. Le module ne connaît, lui, ni
 * l'inscription ni la souscription : il expose des services, les moments
 * d'appel appartiennent aux appelants.
 *
 * `IamInfrastructureModule` : résolution de `TokenService` par le
 * `JwtAuthGuard` du contrôleur dans le contexte de CE module — même leçon que
 * ReconciliationModule (boot impossible sans lui, constaté).
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserEntity, ParrainageAttributionEntity]),
    IamInfrastructureModule,
    NotificationsModule,
  ],
  controllers: [ParrainageController],
  providers: [
    AssurerCodeParrainageService,
    AttribuerBonusParrainageService,
    RattacherFilleulService,
  ],
  exports: [
    AssurerCodeParrainageService,
    AttribuerBonusParrainageService,
    RattacherFilleulService,
  ],
})
export class ParrainageModule {}
