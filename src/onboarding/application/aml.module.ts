import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlMonitorService } from './services/aml-monitor.service';
import { AdminComplianceController } from '../presentation/http/admin-compliance.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

/**
 * **Surveillance LCB-FT** — les seuils de mouvements suspects, et l'écran de
 * classement PEP.
 *
 * Ce module vivait dans `src/common/aml/`, rangé avec les briques techniques.
 * La lutte contre le blanchiment **est** la Conformité : §3.1 la nomme dans la
 * même ligne que le KYC — « métier réglementé (PSFP art. 21, LCB-FT) » — et le
 * classe en Support critique, bloquant pour toute opération financière. Son
 * contrôleur s'appelait déjà `AdminComplianceController` et publiait sur
 * `/admin/compliance` : le nom disait où il devait vivre.
 *
 * Il reste un module à part au sein du contexte, et non fondu dans
 * `ComplianceModule` : le KYC et l'adéquation ont leurs propres modules
 * (`KycModule`, `ProfilesModule`), et la surveillance des flux est un troisième
 * sujet, consommé par `catalog` et `distributions` quand ils déplacent des
 * fonds.
 *
 * > ⚠️ `AmlMonitorService` est un stub assumé : deux seuils lus dans
 * > l'environnement, un log d'audit et une notification aux rôles
 * > COMPLIANCE/RCCI/FINANCIER. §3.1 range la vérification documentaire en
 * > **Generic** — sous-traitée — et le vrai prestataire de criblage reste à
 * > brancher derrière une Anti-Corruption Layer (§20).
 */
@Module({
  imports: [
    NotificationsModule,
    IamInfrastructureModule,
    TypeOrmModule.forFeature([UserEntity]),
  ],
  controllers: [AdminComplianceController],
  providers: [AmlMonitorService],
  exports: [AmlMonitorService],
})
export class AmlModule {}
