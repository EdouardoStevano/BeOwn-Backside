import { Module } from '@nestjs/common';
import { KycModule } from './application/kyc.module';
import { ProfilesModule } from './application/profiles.module';

/**
 * Façade du Bounded Context **Onboarding & KYC** — l'entrée en relation de
 * l'investisseur : qui il est, ce qu'il déclare, et s'il peut opérer.
 *
 * Le contexte réunit deux features, qui gardent chacune leur module Nest comme
 * `Authentication` et `Users` dans IAM — un contexte n'est pas un module, c'est
 * une frontière de langage et de dossier :
 *
 * - **M2, vérification d'identité** (`KycModule`) : ouverture du dossier,
 *   session Stripe Identity, webhooks, revue manuelle par le RCCI ;
 * - **M3, dossier investisseur** (`ProfilesModule`) : profil personne physique,
 *   profils personne morale, pièces justificatives, bénéficiaires effectifs,
 *   verdict KYB.
 *
 * **Ce qui a changé, et pourquoi.** Ce module s'appelait `ComplianceModule` et
 * portait une troisième feature : le questionnaire d'adéquation. §3.3 les
 * réunissait au motif que RG-KYC-13 fait dériver la catégorisation PSFP du
 * questionnaire, et que les séparer créerait une dépendance cyclique entre deux
 * Bounded Contexts. Ce cycle a disparu du code : le classement a quitté
 * `ProfilPP` pour `EvaluationDAdequation`, et la dérivation est désormais à sens
 * unique, entièrement contenue dans cette racine. Restaient deux
 * responsabilités qui n'ont ni le même vocabulaire, ni le même rythme, ni le
 * même interlocuteur — l'une répond au RCCI et à la LCB-FT, l'autre à
 * l'obligation d'adéquation du règlement 2020/1503. D'où `AdequacyModule`.
 *
 * Position dans la Context Map (§3.4) : `onboarding` est **en amont** de
 * `reservation`, `subscription` et `secondary-market`, à qui il fournit
 * l'éligibilité de l'investisseur par `PROFIL_CONFORMITE_QUERY`. Il est en aval
 * d'`identity`, dont il lit le compte par `USER_REPOSITORY`, et en aval
 * d'`adequacy`, dont il lit le classement et l'avancement du questionnaire par
 * leurs ports. Aucune flèche ne repart de ces contextes vers lui autrement que
 * par lecture de son verdict.
 */
@Module({
  imports: [KycModule, ProfilesModule],
  exports: [KycModule, ProfilesModule],
})
export class OnboardingModule {}
