import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { PORTEFEUILLE_INVESTISSEUR } from 'src/iam/application/ports/portefeuille-investisseur.port';
import { TypeOrmPortefeuilleInvestisseurAdapter } from 'src/iam/infrastructure/anti-corruption/typeorm-portefeuille-investisseur.adapter';
import { CgpController } from 'src/iam/presentation/http/cgp.controller';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ConsulterPortefeuilleCgpUseCase } from './usecases/cgp/consulter-portefeuille-cgp.usecase';
import { PublierCodeParrainageUseCase } from './usecases/cgp/publier-code-parrainage.usecase';
import { RattacherAUnCgpUseCase } from './usecases/cgp/rattacher-a-un-cgp.usecase';

/**
 * Feature « conseillers en gestion de patrimoine » d'IAM.
 *
 * Le rattachement d'un titulaire à son conseiller et le code qui le permet sont
 * des attributs du compte : ils vivent sur `User`, dans les colonnes qui les
 * portaient déjà, et se règlent par ses méthodes. C'est à ce titre que
 * `src/cgp/` a rejoint `identity` plutôt que de rester un module à part —
 * un dossier qui ne contenait qu'un contrôleur n'était pas un contexte.
 *
 * `TypeOrmModule.forFeature([InvestmentEntity])` est la seule concession : le
 * poids du portefeuille se lit dans le contexte des souscriptions. Elle est
 * confinée à l'adapter d'Anti-Corruption (§20), qui l'expose sous
 * `PORTEFEUILLE_INVESTISSEUR` — les use cases ne connaissent que ce port.
 *
 * Module Nest distinct plutôt que fondu dans `UsersModule` : il tire une table
 * d'un autre contexte, et rien ne justifie d'imposer cette dépendance à toutes
 * les routes du compte (CRP, §24).
 */
@Module({
  imports: [
    UsersInfrastructureModule,
    TypeOrmModule.forFeature([InvestmentEntity]),
    // Fournit `TokenService`, dont dépend le `JwtAuthGuard` global.
    IamInfrastructureModule,
  ],
  providers: [
    ConsulterPortefeuilleCgpUseCase,
    PublierCodeParrainageUseCase,
    RattacherAUnCgpUseCase,
    {
      provide: PORTEFEUILLE_INVESTISSEUR,
      useClass: TypeOrmPortefeuilleInvestisseurAdapter,
    },
  ],
  controllers: [CgpController],
})
export class CgpModule {}
