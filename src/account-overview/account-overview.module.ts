import { Module } from '@nestjs/common';
import { GetMyAccountUseCase } from './applications/usecases/get-my-account.usecase';
import { GetUserAccountUseCase } from './applications/usecases/get-user-account.usecase';
import { AccountOverviewController } from './presenters/http/account-overview.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { ProfilesModule } from 'src/profiles/applications/profiles.module';
import { PreferencesModule } from 'src/preferences/applications/preferences.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';

/**
 * Module de **composition** : il assemble ce que plusieurs Bounded Contexts
 * savent chacun de leur côté, pour les deux lectures du compte que le front
 * appelle en premier.
 *
 * Sa règle d'existence tient en une ligne : **il importe, il n'est jamais
 * importé**. Aucun autre module ne dépend de lui, donc aucune arête ne peut
 * revenir vers ses dépendances. C'est ce qui casse le cycle `iam ↔ profiles` —
 * IAM redevient le contexte purement amont qu'il doit être, et Profiles,
 * Preferences, Documents et Wallets continuent de dépendre d'IAM dans le seul
 * sens légitime.
 *
 * Corollaire à tenir : **rien de métier ici**. Une règle qui apparaît dans un
 * use case de ce module est le signe qu'elle appartient à l'un des contextes
 * composés. Le contrôle d'accès de `GetUserAccountUseCase` est la seule
 * exception, et il porte sur le compte — donc sur du vocabulaire IAM, dont ce
 * module dépend déjà.
 */
@Module({
  imports: [
    // `TokenService` pour le JwtAuthGuard monté par le contrôleur.
    IamInfrastructureModule,
    // `USER_REPOSITORY` — l'identité du compte, lue par son port.
    UsersInfrastructureModule,
    // `GetOnboardingStatusUseCase` (avancement du dossier réglementaire) et,
    // par réexport, `KYC_REPOSITORY`.
    ProfilesModule,
    // `GetPreferencesUseCase` — les réglages publiés à côté du compte.
    PreferencesModule,
    DocumentsInfrastructureModule,
    WalletsInfrastructureModule,
  ],
  providers: [GetMyAccountUseCase, GetUserAccountUseCase],
  controllers: [AccountOverviewController],
})
export class AccountOverviewModule {}
