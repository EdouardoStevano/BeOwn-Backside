import { KycNiveau } from 'src/compliance/domain/enums/kyc-status.enum';
import { KycCase } from 'src/compliance/domain/entities/kyc-case';
import { DecisionKyc } from 'src/compliance/domain/value-objects/decision-kyc.vo';
import { eprouverUtilisateurIdDuDossierKyc } from 'src/compliance/domain/value-objects/identifiant-utilisateur';
import { NomFournisseur } from 'src/compliance/domain/value-objects/nom-fournisseur.vo';

/**
 * Prestataire de vérification d'identité par défaut.
 *
 * La chaîne `'stripeIdentity'` était écrite en dur aux deux endroits qui
 * ouvraient un dossier, et ne s'accordait déjà pas avec le `default: 'stripe'`
 * de la colonne : une ligne créée par la fabrique et une ligne créée par un
 * `INSERT` direct ne désignaient pas le même fournisseur. La valeur qui fait
 * foi est celle-ci — c'est elle que le code a toujours écrite.
 */
export const FOURNISSEUR_PAR_DEFAUT = 'stripeIdentity';

/**
 * Niveau d'examen par défaut : la diligence normale du règlement LCB-FT.
 * `SIMPLE` et `RENFORCE` sont des décisions de conformité, prises dossier par
 * dossier — jamais à l'ouverture.
 */
export const NIVEAU_PAR_DEFAUT = KycNiveau.STANDARD;

/** Ce qu'il faut pour ouvrir un dossier. Tout le reste est décidé ici. */
export interface CreerKycProps {
  utilisateurId: number;
  /** Prestataire choisi ; à défaut {@link FOURNISSEUR_PAR_DEFAUT}. */
  fournisseur?: string;
  /** Diligence exigée ; à défaut {@link NIVEAU_PAR_DEFAUT}. */
  niveau?: KycNiveau;
}

/**
 * Ouverture d'un dossier de vérification d'identité.
 *
 * Même rôle que `ProfilPPFactory` et `ProfilPMFactory` : rassembler ce qui est
 * décidé à la naissance, pour que ce soit décidé **une fois**. Ces choix
 * vivaient dupliqués dans `CreateKycUseCase` et `PaymentController.startKyc`,
 * sous la forme de huit affectations sur un objet vide — deux copies d'une
 * même liste, et la couche présentation de Payments fabriquant un agrégat du
 * contexte Profiles au passage (§12.5).
 *
 * Ce que la fabrique décide, et qu'aucun appelant ne peut donc contredire :
 *
 * - le **statut de départ**, qui n'est pas déclarable — voir
 *   {@link DecisionKyc.initiale}. C'est l'invariant qui compte ici : un dossier
 *   né `VALIDE` autoriserait dépôts, investissements et retraits sans qu'aucune
 *   pièce d'identité ait été examinée ;
 * - l'absence de **score de risque** et de **référence fournisseur** : ils
 *   n'existent qu'après examen, et un dossier qui naîtrait avec une session
 *   déjà rattachée en désignerait une qui n'a jamais été ouverte.
 *
 * Une classe à méthodes statiques, sans `@Injectable` : elle ne dépend de rien,
 * et un décorateur NestJS introduirait dans le domaine une dépendance de
 * framework que rien ne justifie (§12.1).
 */
export class KycFactory {
  static creer(props: CreerKycProps): KycCase {
    return new KycCase({
      entete: {
        utilisateurId: eprouverUtilisateurIdDuDossierKyc(props.utilisateurId),
        // Attribués par la persistance — l'`id` est un uuid généré en base.
        id: undefined as unknown as string,
        createdAt: undefined as unknown as Date,
        updatedAt: undefined as unknown as Date,
      },
      decision: DecisionKyc.initiale(),
      niveau: props.niveau ?? NIVEAU_PAR_DEFAUT,
      scoreRisque: null,
      fournisseur: NomFournisseur.of(
        props.fournisseur ?? FOURNISSEUR_PAR_DEFAUT,
      ).value,
      fournisseurRef: null,
      stripeReportId: null,
      identiteExtrait: null,
    });
  }
}
