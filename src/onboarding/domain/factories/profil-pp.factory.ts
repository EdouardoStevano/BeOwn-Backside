import {
  ChampsDeclaresProfilPP,
  ProfilPP,
} from 'src/onboarding/domain/aggregates/profil-pp';
import { Coordonnees } from 'src/onboarding/domain/value-objects/coordonnees.vo';
import { eprouverUtilisateurId } from 'src/onboarding/domain/value-objects/identifiant-utilisateur';
import { Identite } from 'src/onboarding/domain/value-objects/identite.vo';
import { SituationFiscale } from 'src/onboarding/domain/value-objects/situation-fiscale.vo';
import { SituationProfessionnelle } from 'src/onboarding/domain/value-objects/situation-professionnelle.vo';

/** Ce qu'il faut pour faire naître un profil, en plus des champs déclarés. */
export interface CreerProfilPPProps extends ChampsDeclaresProfilPP {
  userId: number;
}

/**
 * Naissance d'un profil personne physique.
 *
 * Créer un profil, c'est répartir un formulaire plat entre cinq blocs, décider
 * de ce qui n'est **pas** déclarable, et fixer un classement réglementaire de
 * départ. Rien de tout cela n'est le métier de l'agrégat, qui a pour rôle de
 * faire respecter ses règles une fois né — deux raisons de changer pour une
 * même classe (§4 — SRP). `ProfilPP.creer` a donc migré ici.
 *
 * Le prénom, le nom et le téléphone ne figurent plus parmi les props : ils
 * appartiennent au compte. La fabrique n'a donc plus besoin qu'on lui passe
 * l'état civil, et le dossier ne peut plus en garder une copie divergente.
 *
 * Une classe à méthodes statiques, sans `@Injectable` : contrairement à
 * `UserFactory` du contexte IAM, qui doit se faire injecter le port de hachage,
 * cette fabrique ne dépend de rien. Lui coller un décorateur NestJS
 * introduirait dans le domaine une dépendance de framework que rien ne
 * justifie (§12.1).
 */
export class ProfilPPFactory {
  /**
   * Nouveau profil personne physique.
   *
   * Chaque bloc éprouve sa part des données déclarées — c'est là que vivent les
   * règles de validité et les invariants croisés. La fabrique, elle, ne décide
   * que de deux choses, et ce sont justement celles qu'aucun bloc ne peut
   * prendre seul :
   *
   * - le **rattachement au compte**, éprouvé ici parce qu'il n'appartient à
   *   aucun bloc et conditionne l'existence de la ligne ;
   * - le fait que l'**évaluation réglementaire ne le concerne pas**. Le
   *   classement PSFP est calculé par le questionnaire d'adéquation et porté
   *   par `EvaluationDAdequation` : aucune porte, ici, par laquelle on
   *   pourrait naître « professionnel » sans y avoir répondu.
   */
  static creer(props: CreerProfilPPProps): ProfilPP {
    return new ProfilPP({
      entete: {
        // Comme les dates : attribuée par la persistance. Un profil qui n'a
        // jamais été sauvegardé n'a pas encore d'identité — c'est l'écriture
        // qui la lui donne, et `save` rend l'agrégat rechargé.
        id: undefined as unknown as string,
        userId: eprouverUtilisateurId(props.userId, 'userId'),
        // Absence de réponse = pas de déclaration PEP. Le doute ne rend pas
        // quelqu'un politiquement exposé ; c'est le KYC qui tranche.
        pep: props.pep === true,
        // Attribuées par la persistance.
        createdAt: undefined as unknown as Date,
        updatedAt: undefined as unknown as Date,
      },
      identite: Identite.declarer(props),
      coordonnees: Coordonnees.declarer(props),
      situationProfessionnelle: SituationProfessionnelle.declarer(props),
      situationFiscale: SituationFiscale.declarer(props),
    });
  }
}
