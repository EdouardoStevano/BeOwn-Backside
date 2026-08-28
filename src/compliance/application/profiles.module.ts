import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ProfilesInfrastructureModule } from '../infrastructure/profiles-infrastructure.module';
import { ComplianceInfrastructureModule } from '../infrastructure/compliance-infrastructure.module';
import { CreateProfilPPUseCase } from './usecases/profiles/create-profil-pp.usecase';
import { ProfileController } from '../presentation/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/profiles/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/profiles/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/profiles/create-profil-pm.usecase';
import { GetProfilPMUseCase } from './usecases/profiles/get-profil-pm.usecase';
import { ListProfilsPMUseCase } from './usecases/profiles/list-profils-pm.usecase';
import { UpdateProfilPMUseCase } from './usecases/profiles/update-profil-pm.usecase';
import { SaveQuestionnaireUseCase } from './usecases/profiles/save-questionnaire.usecase';
import { RepondreEtapeQuestionnaireUseCase } from './usecases/profiles/repondre-etape-questionnaire.usecase';
import { GetQuestionnaireUseCase } from './usecases/profiles/get-questionnaire.usecase';
import { GetOnboardingStatusUseCase } from './usecases/profiles/get-onboarding-status.usecase';
import { DeposerPieceUseCase } from './usecases/pieces/deposer-piece.usecase';
import { ConsulterDossierDePiecesUseCase } from './usecases/pieces/consulter-dossier-de-pieces.usecase';
import { DeciderPieceUseCase } from './usecases/pieces/decider-piece.usecase';
import { DeclarerBeneficiaireUseCase } from './usecases/beneficiaires/declarer-beneficiaire.usecase';
import { ConsulterRegistreUseCase } from './usecases/beneficiaires/consulter-registre.usecase';
import { RetirerBeneficiaireUseCase } from './usecases/beneficiaires/retirer-beneficiaire.usecase';
import { ListerProfilsInvestisseurUseCase } from './usecases/investisseur/lister-profils-investisseur.usecase';
import { BasculerProfilInvestisseurUseCase } from './usecases/investisseur/basculer-profil-investisseur.usecase';
import { ProfilInvestisseurController } from '../presentation/http/profil-investisseur.controller';
import { PieceJustificativeRefuseeEventHandler } from './handlers/piece-justificative-refusee.event-handler';
import { CompletudeDuDossierEventHandler } from './handlers/completude-du-dossier.event-handler';
import { KybTrancheEventHandler } from './handlers/kyb-tranche.event-handler';
import { DeciderKybUseCase } from './usecases/kyb/decider-kyb.usecase';
import { AdminKybController } from '../presentation/http/admin-kyb.controller';
import { PieceJustificativeController } from '../presentation/http/piece-justificative.controller';
import { AdminPieceJustificativeController } from '../presentation/http/admin-piece-justificative.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { KycInfrastructureModule } from 'src/compliance/infrastructure/kyc-infrastructure.module';
import { RiskScoringService } from './services/risk-scoring.service';
import { BeneficiaireEffectifController } from '../presentation/http/beneficiaire-effectif.controller';

/**
 * Dossier de l'investisseur : profil personne physique, profil personne
 * morale, questionnaire d'adéquation.
 *
 * Feature de `compliance`, aux côtés de `KycModule` — c'est le M3 du cahier
 * des charges, et le M2 est à côté (§3.2). Le module a transité par IAM le
 * temps de deux commits : ce qu'il décrit — qui est le titulaire, où il vit,
 * ce qu'il déclare — ressemble à de l'identité.
 *
 * Ce n'en est pas. Ce que ce dossier établit, c'est l'**éligibilité** : la
 * catégorisation Averti / Non-averti (`QualificationPsfp`), la capacité de
 * perte (`EvaluationInvestisseur`), le plafond réglementaire
 * (`PlafondPsfpService`). L'identité, au sens d'`identity`, s'arrête au compte
 * — prénom, adresse email, mot de passe, facteurs. Ce que le titulaire
 * **déclare** de lui, numéro de téléphone compris, est au dossier.
 *
 * La preuve par la dépendance : ce module importe `KycInfrastructureModule`
 * pour composer l'avancement du parcours d'entrée en relation, et RG-KYC-13
 * fait dériver la catégorisation PSFP du questionnaire. Séparer les deux
 * faisait passer un même concept par une frontière de contexte, dans les deux
 * sens (§3.3).
 *
 * Le nom `Profiles` est celui du dossier d'origine ; il est appelé à devenir
 * celui du modèle unifié, `InvestorComplianceProfile` (§3.2).
 */
@Module({
  imports: [
    // Bus d'événements du contexte : la complétion du dossier annonce un fait
    // métier, sans savoir qui y réagit (§8).
    CqrsModule,
    ProfilesInfrastructureModule,
    // `INVESTOR_COMPLIANCE_PROFILE_REPOSITORY` : le passage du questionnaire
    // s'enregistre par la racine, qui dit ce que le classement impose.
    ComplianceInfrastructureModule,
    // `IamInfrastructureModule` pour `TokenService` (JwtAuthGuard),
    // `UsersInfrastructureModule` pour le seul `USER_REPOSITORY` : le contexte
    // Profiles lit l'identité du compte par le port d'IAM, plus par son entité
    // ORM. Deux modules plutôt qu'un, parce qu'IAM les sépare exprès — les ~20
    // modules qui n'ont besoin que du token ne tirent pas la persistance des
    // comptes avec (CRP, §5).
    IamInfrastructureModule,
    UsersInfrastructureModule,
    // `KYC_REPOSITORY` — pour la seule étape « vérification d'identité » du
    // parcours d'entrée en relation (`GetOnboardingStatusUseCase`). L'infra du
    // contexte KYC, pas son module applicatif : Profiles lit un dossier, il
    // n'ouvre pas de session Stripe et n'écoute aucun de ses événements (§5).
    KycInfrastructureModule,
    // Plus aucune entité ORM ici. Ce module en déclarait deux — les
    // bénéficiaires effectifs et le profil moral — parce que
    // `BeneficiaireEffectifController` injectait leur `Repository` et faisait
    // `create` / `save` / `delete` lui-même. C'était le dernier endroit de ce
    // contexte où la présentation touchait la base ; il passe désormais par
    // trois use cases et le port du registre (§12.3, §12.9).
    // `NotificationService` : le refus d'une pièce est annoncé au titulaire —
    // c'est la moitié de « l'utilisateur sera notifié par mail et pourra
    // modifier lui-même les documents refusés ». Le contexte s'abonne à son
    // propre événement, il n'appelle pas le service depuis le use case (§8).
    NotificationsModule,
  ],
  providers: [
    CreateProfilPPUseCase,
    GetProfilPPUseCase,
    UpdateProfilPPUseCase,
    CreateProfilPMUseCase,
    GetProfilPMUseCase,
    ListProfilsPMUseCase,
    UpdateProfilPMUseCase,
    SaveQuestionnaireUseCase,
    RepondreEtapeQuestionnaireUseCase,
    GetQuestionnaireUseCase,
    GetOnboardingStatusUseCase,
    // Les pièces justificatives du dossier moral — dépôt par le titulaire,
    // instruction par l'équipe conformité, annonce du refus.
    DeposerPieceUseCase,
    ConsulterDossierDePiecesUseCase,
    DeciderPieceUseCase,
    PieceJustificativeRefuseeEventHandler,
    // Le verdict KYB de la société — l'instruction du dossier une fois ses
    // pièces réunies, et ce qui le défait quand l'une d'elles bouge.
    //
    // `CompletudeDuDossierEventHandler` est le pont entre deux agrégats qui ne
    // se connaissent pas : `DossierDePieces` constate ce qui manque, la racine
    // de conformité décide ce que la société a le droit de faire. Deux
    // frontières transactionnelles, donc un événement et non un appel (§17).
    DeciderKybUseCase,
    CompletudeDuDossierEventHandler,
    KybTrancheEventHandler,
    // Le registre des bénéficiaires effectifs — le seuil de 25 %, la
    // distinction directe/indirecte et le plafond du capital.
    DeclarerBeneficiaireUseCase,
    ConsulterRegistreUseCase,
    RetirerBeneficiaireUseCase,
    // Au nom de qui le compte agit — le sélecteur d'identité et son aptitude.
    ListerProfilsInvestisseurUseCase,
    BasculerProfilInvestisseurUseCase,
    RiskScoringService,
    // Plus de filtre propre : les erreurs du dossier investisseur sont des
    // `IamError` depuis qu'elles ont rejoint le contexte, et `IamErrorFilter`
    // — enregistré globalement par `IamModule` — les traduit avec les mêmes
    // statuts et le même corps que `ProfilesErrorFilter` produisait.
  ],
  controllers: [
    ProfileController,
    BeneficiaireEffectifController,
    PieceJustificativeController,
    AdminPieceJustificativeController,
    AdminKybController,
    ProfilInvestisseurController,
  ],
  exports: [
    // Consommé par `UserController` (IAM) : `GET /users/me` compose le compte
    // avec l'avancement du dossier, que seul ce contexte sait calculer.
    GetOnboardingStatusUseCase,
    ProfilesInfrastructureModule,
    RiskScoringService,
  ],
})
export class ProfilesModule {}
