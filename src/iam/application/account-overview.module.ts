import { Module } from '@nestjs/common';
import { GetMyAccountUseCase } from './usecases/account-overview/get-my-account.usecase';
import { GetUserAccountUseCase } from './usecases/account-overview/get-user-account.usecase';
import { AccountOverviewController } from '../presentation/http/account-overview.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { ProfilesModule } from 'src/onboarding/application/profiles.module';
import { KycInfrastructureModule } from 'src/onboarding/infrastructure/kyc-infrastructure.module';
import { PreferencesModule } from 'src/iam/application/preferences.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { TreasuryInfrastructureModule } from 'src/treasury/infrastructure/treasury-infrastructure.module';

/**
 * Module de **composition** : il assemble ce que plusieurs Bounded Contexts
 * savent chacun de leur côté, pour les deux lectures du compte que le front
 * appelle en premier.
 *
 * Sa règle d'existence tient en une ligne : **il importe, il n'est jamais
 * importé**. Aucun autre module ne dépend de lui, donc aucune arête ne peut
 * revenir vers ses dépendances. C'est ce qui casse le cycle `iam ↔ profiles` —
 * IAM redevient le contexte purement amont qu'il doit être, et KYC, Documents
 * et Treasury continuent de dépendre d'IAM dans le seul sens légitime.
 *
 * Il vit désormais dans `src/iam/` — les deux routes qu'il sert, `GET /users/me`
 * et `GET /users/:id`, lisent le compte — mais **reste un module Nest distinct**,
 * et n'est monté que par `AppModule`. `IamModule` ne l'importe pas : ce serait
 * faire dépendre le contexte de tout ce que ce module compose, et rouvrir
 * exactement l'arête que sa règle d'existence interdit. La frontière de
 * contexte est le dossier et le langage (§3.2), pas le graphe de modules.
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
    // `GetOnboardingStatusUseCase` — l'avancement du dossier réglementaire —
    // et `ListerProfilsInvestisseurUseCase` — au nom de qui le compte agit,
    // avec l'aptitude de chaque identité. Deux lectures **déjà composées par
    // le contexte conformité** : les prendre telles quelles est ce qui tient
    // la règle d'existence de ce module, puisqu'un verdict KYB recomposé ici
    // serait précisément le « rien de métier » qu'il s'interdit.
    ProfilesModule,
    // `DOSSIER_KYC_QUERY` — le dossier de vérification, publié à côté du
    // compte. Un port de lecture du contexte voisin, jamais son repository.
    KycInfrastructureModule,
    // `GetPreferencesUseCase` — les réglages publiés à côté du compte.
    PreferencesModule,
    DocumentsInfrastructureModule,
    TreasuryInfrastructureModule,
  ],
  providers: [GetMyAccountUseCase, GetUserAccountUseCase],
  controllers: [AccountOverviewController],
})
export class AccountOverviewModule {}
