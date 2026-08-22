import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcheanceEntity } from './persistence/entities/echeance.entity';

/**
 * Adapters de sortie du contexte Servicing.
 *
 * Il n'expose pour l'instant que la table des échéances, dont les contextes en
 * aval ont besoin en lecture (le back-office pour l'échéancier emprunteur, les
 * KPI pour les coupons perçus). Le port de l'échéancier — et la disparition de
 * cet accès direct à l'entité — vient avec le modèle du contexte.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EcheanceEntity])],
  exports: [TypeOrmModule],
})
export class ServicingInfrastructureModule {}
