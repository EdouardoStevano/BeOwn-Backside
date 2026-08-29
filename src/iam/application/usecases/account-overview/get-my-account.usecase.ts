import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
} from 'src/documents/domain/repositories/document.repository';
import { UtilisateurIntrouvableError } from 'src/iam/domain/errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { GetPreferencesUseCase } from 'src/iam/application/usecases/preferences/get-preferences.usecase';
import { GetOnboardingStatusUseCase } from 'src/compliance/application/usecases/profiles/get-onboarding-status.usecase';
import {
  ListerProfilsInvestisseurUseCase,
  type ProfilDisponible,
} from 'src/compliance/application/usecases/investisseur/lister-profils-investisseur.usecase';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/treasury/domain/repositories/wallet.repository';

/**
 * Vue d'ensemble du compte du titulaire : qui il est, où en est son dossier,
 * ce qu'il possède.
 *
 * **Composition, pas métier.** Chaque contexte répond de sa part — le dossier
 * réglementaire et son avancement viennent de `GetOnboardingStatusUseCase`,
 * les réglages de `GetPreferencesUseCase`, le portefeuille et les pièces de
 * leurs ports respectifs. Ce use case les demande de front et assemble ; il ne
 * décide de rien.
 *
 * **Pourquoi ce module et pas IAM.** La composition a d'abord quitté
 * `UserController.getMe`, qui se faisait injecter cinq repositories appartenant
 * à quatre autres contextes (§2, §12.9). Elle a ensuite quitté IAM lui-même :
 * y rester obligeait le contexte le plus **amont** de l'application — celui
 * dont une vingtaine de modules dépendent pour l'identité — à dépendre en
 * retour de Profiles, Preferences, Documents et Treasury. Le cycle de paquets
 * `iam ↔ profiles` venait de là, et de là seulement pour la lecture.
 *
 * `account-overview` est en **aval de tout le monde** et n'est importé par
 * personne : la dépendance ne peut plus revenir. C'est aussi le côté Query de
 * §7 — une lecture dénormalisée n'a pas à traverser le domaine riche de cinq
 * contextes.
 *
 * Chaque lecture est **tolérante** : un portefeuille indisponible ne doit pas
 * empêcher le titulaire de voir son compte. C'était déjà le cas, et c'est
 * volontaire — cette route est la page d'accueil de l'espace connecté.
 *
 * **Ce que le compte publie de la conformité, et pourquoi ce n'est pas une
 * seule chose.** Trois notions y coexistent, qu'un unique drapeau confondrait :
 *
 * | Clé                        | Ce qu'elle dit                                   |
 * | -------------------------- | ------------------------------------------------ |
 * | `isProfileComplete`        | le parcours d'entrée en relation est bouclé      |
 * | `profilActif.aptitude`     | l'identité qui agit peut, ou non, opérer         |
 * | `classement`               | jusqu'où elle peut aller — catégorie et plafond  |
 *
 * La deuxième est la seule **opposable**, et elle n'est pas déductible de la
 * première : un représentant légal dont le parcours est complet ne peut rien
 * souscrire au nom d'une société dont le KYB n'est pas validé.
 */
@Injectable()
export class GetMyAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly getOnboardingStatus: GetOnboardingStatusUseCase,
    // Le sélecteur d'identité, **composé par le contexte conformité**. La vue
    // d'ensemble ne le reconstitue pas : l'aptitude d'une société croise son
    // KYB, l'immatriculation, les bénéficiaires et les pièces, c'est-à-dire une
    // règle réglementaire qui n'a rien à faire dans un module de composition.
    private readonly listerProfilsInvestisseur: ListerProfilsInvestisseurUseCase,
    private readonly getPreferences: GetPreferencesUseCase,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(userId: number) {
    const compte = await this.userRepository.findById(userId);
    if (!compte) throw new UtilisateurIntrouvableError();

    const [dossier, profils, documents, wallet, preferences] =
      await Promise.all([
        this.getOnboardingStatus.execute({
          utilisateurId: userId,
          typeDeclare: compte.userType,
        }),
        this.listerProfilsInvestisseur
          .execute(userId)
          .catch((): ProfilDisponible[] => []),
        this.documentRepository.findByUserId(userId).catch(() => []),
        this.walletRepository
          .findByUser(userId, WalletType.INVESTISSEUR)
          .catch(() => null),
        this.getPreferences.execute(userId).catch(() => null),
      ]);

    return {
      ...compte.toJSON(),
      // Le type **effectif** prime sur le type annoncé : c'est le dossier
      // réellement ouvert qui fait foi, et lui seul est opposable.
      //
      // Il reste un raccourci d'affichage, et il ne dit **pas** au nom de qui
      // le compte agit : un représentant légal est « PM » dès qu'il déclare une
      // société, y compris quand il opère en son nom propre. C'est
      // `profilActif` qui répond à cette question-là.
      userType: dossier.userType ?? compte.userType,
      profilPP: dossier.profilPP,
      profilsPM: dossier.profilsPM,
      kyc: dossier.kyc,
      // Le classement PSFP — catégorie, patrimoine déclaré, montant conseillé.
      // Il transitait par `profilPP` jusqu'à ce qu'il rejoigne la racine de
      // conformité ; il n'était depuis plus publié nulle part, alors même que
      // c'est lui qui porte le plafond opposé à la souscription.
      classement: dossier.classement,
      // Au nom de qui le compte agit, et ce que chacune de ses identités
      // permet. `profilActif` est extrait ici plutôt que laissé à trouver au
      // front : c'est la seule des entrées dont dépend l'écran d'accueil, et la
      // chercher par son drapeau à chaque lecture invite à l'oublier.
      profilActif: profils.find((profil) => profil.actif) ?? null,
      profilsDisponibles: profils,
      wallet: wallet ?? null,
      documents,
      completionStep: dossier.completionStep,
      completionSteps: dossier.completionSteps,
      completionProgress: dossier.completionProgress,
      isProfileComplete: dossier.isProfileComplete,
      // L'étape du questionnaire qu'il reste à poser — le parcours se répond en
      // trois temps, et seul le domaine sait laquelle vient.
      etapeSuivanteQuestionnaire: dossier.etapeSuivanteQuestionnaire,
      etapesQuestionnaireRepondues: dossier.etapesQuestionnaireRepondues,
      preferences,
    };
  }
}
