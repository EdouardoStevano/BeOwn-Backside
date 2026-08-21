import { Module } from '@nestjs/common';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { ChangerTelephoneUseCase } from './usecases/account/changer-telephone.usecase';

/**
 * Coordonnées du compte, exposées aux contextes qui les alimentent.
 *
 * Volontairement minuscule — un use case, un import — pour la même raison que
 * `IamInfrastructureModule` l'est : le contexte qui déclare un numéro de
 * téléphone n'a aucune raison de tirer avec lui le contrôleur des comptes, la
 * suppression self-service et les quatre modules d'infrastructure dont
 * `UsersModule` dépend (CRP, §5).
 *
 * C'est aussi ce qui garde la dépendance dans le bon sens : IAM est le contexte
 * le plus amont, et rien ici n'importe quoi que ce soit d'un contexte aval.
 * L'abonnement à l'événement, lui, reste du côté qui a le droit de dépendre
 * d'IAM — voir `TelephoneDeclareEventHandler`.
 */
@Module({
  imports: [UsersInfrastructureModule],
  providers: [ChangerTelephoneUseCase],
  exports: [ChangerTelephoneUseCase],
})
export class AccountContactModule {}
