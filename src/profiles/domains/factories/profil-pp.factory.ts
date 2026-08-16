import {
  ChampsDeclaresProfilPP,
  ProfilPP,
} from 'src/profiles/domains/profil-pp';
import { Coordonnees } from 'src/profiles/domains/value-objects/coordonnees.vo';
import { EvaluationInvestisseur } from 'src/profiles/domains/value-objects/evaluation-investisseur.vo';
import { eprouverUtilisateurId } from 'src/profiles/domains/value-objects/identifiant-utilisateur';
import { Identite } from 'src/profiles/domains/value-objects/identite.vo';
import { SituationFiscale } from 'src/profiles/domains/value-objects/situation-fiscale.vo';
import { SituationProfessionnelle } from 'src/profiles/domains/value-objects/situation-professionnelle.vo';

/** Ce qu'il faut pour faire naître un profil, en plus des champs déclarés. */
export interface CreerProfilPPProps extends ChampsDeclaresProfilPP {
  utilisateurId: number;
  /** Repris du compte — voir `MARQUEUR_IDENTITE_INCONNUE`. */
  prenom: string | null | undefined;
  nom: string | null | undefined;
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
   * - la **clé** du profil, éprouvée ici parce qu'elle n'appartient à aucun
   *   bloc et conditionne l'existence de la ligne ;
   * - le fait que l'**évaluation réglementaire n'est pas déclarable**. Elle part
   *   de son état initial quoi qu'on lui passe, ce qui ferme la seule porte par
   *   laquelle on aurait pu naître « professionnel » sans questionnaire
   *   d'adéquation — donc sans délai de rétractation ni plafond.
   */
  static creer(props: CreerProfilPPProps): ProfilPP {
    return new ProfilPP({
      entete: {
        utilisateurId: eprouverUtilisateurId(props.utilisateurId),
        // Absence de réponse = pas de déclaration PEP. Le doute ne rend pas
        // quelqu'un politiquement exposé ; c'est le KYC qui tranche.
        pep: props.pep === true,
        // Attribuées par la persistance.
        createdAt: undefined as unknown as Date,
        updatedAt: undefined as unknown as Date,
      },
      identite: Identite.declarer(
        { prenom: props.prenom, nom: props.nom },
        props,
      ),
      coordonnees: Coordonnees.declarer(props),
      situationProfessionnelle: SituationProfessionnelle.declarer(props),
      situationFiscale: SituationFiscale.declarer(props),
      evaluation: EvaluationInvestisseur.initiale(),
    });
  }
}
