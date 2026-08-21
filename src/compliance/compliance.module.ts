import { Module } from '@nestjs/common';
import { KycModule } from './application/kyc.module';
import { ProfilesModule } from './application/profiles.module';

/**
 * Façade du Bounded Context **Compliance** — l'éligibilité réglementaire de
 * l'investisseur : peut-il opérer, et jusqu'où (§3.2).
 *
 * Le contexte réunit ce que le cahier des charges découpe en deux modules :
 *
 * - **M2, vérification d'identité** (`KycModule`) : ouverture du dossier,
 *   session Stripe Identity, webhooks, revue manuelle par le RCCI ;
 * - **M3, dossier investisseur et adéquation** (`ProfilesModule`) : profil
 *   personne physique, profil personne morale, questionnaire d'adéquation,
 *   catégorisation Averti / Non-averti.
 *
 * Les fusionner n'est pas une commodité de rangement : RG-KYC-13 fait dériver
 * la catégorisation PSFP du questionnaire d'adéquation. Tant que les deux
 * vivaient dans des contextes séparés, ce lien était une dépendance entre
 * contextes — et il l'était dans les deux sens, `ProfilesModule` important
 * l'infrastructure KYC pour composer l'avancement du parcours. C'est le
 * symptôme que §3.3 décrit : une frontière tracée au milieu d'un concept.
 *
 * Les deux features gardent leur module Nest, comme `Authentication` et
 * `Users` dans IAM : un contexte n'est pas un module, c'est une frontière de
 * langage et de dossier.
 *
 * Position dans la Context Map (§3.4) : `compliance` est **en amont** de
 * `reservation`, `subscription` et `secondary-market`, à qui il fournit
 * l'éligibilité de l'investisseur. Il est en aval d'`identity`, dont il lit le
 * compte par `USER_REPOSITORY`. Aucune flèche ne doit repartir de ces trois-là
 * vers lui autrement que par lecture de son verdict.
 */
@Module({
  imports: [KycModule, ProfilesModule],
  exports: [KycModule, ProfilesModule],
})
export class ComplianceModule {}
