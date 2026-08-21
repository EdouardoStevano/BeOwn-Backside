import {
  ChampsDeclaresProfilPM,
  ProfilPM,
  eprouverRepresentantId,
  eprouverSecteurActivite,
  eprouverSiegeAdresse,
} from 'src/compliance/domain/aggregates/profil-pm';
import { CapitalSocial } from 'src/compliance/domain/value-objects/capital-social.vo';
import { eprouverUtilisateurId } from 'src/compliance/domain/value-objects/identifiant-utilisateur';
import { IdentiteLegale } from 'src/compliance/domain/value-objects/identite-legale.vo';

/** Ce qu'il faut pour faire naître un profil moral, en plus des déclarations. */
export interface CreerProfilPMProps extends ChampsDeclaresProfilPM {
  utilisateurId: number;
}

/**
 * Naissance d'un profil personne morale.
 *
 * Même rôle que `ProfilPPFactory` : répartir un formulaire plat entre le bloc
 * et les valeurs restantes, et éprouver ce qu'aucun d'eux ne peut éprouver
 * seul — la clé du profil et l'identifiant du représentant. Le reste est du
 * ressort des Value Objects.
 *
 * Une classe à méthodes statiques, sans `@Injectable` : elle ne dépend de rien,
 * et un décorateur NestJS introduirait dans le domaine une dépendance de
 * framework que rien ne justifie (§12.1).
 */
export class ProfilPMFactory {
  static creer(props: CreerProfilPMProps): ProfilPM {
    return new ProfilPM({
      entete: {
        utilisateurId: eprouverUtilisateurId(props.utilisateurId),
        // Attribuées par la persistance.
        createdAt: undefined as unknown as Date,
        updatedAt: undefined as unknown as Date,
      },
      identiteLegale: IdentiteLegale.declarer(props),
      capitalSocial: CapitalSocial.of(props.capitalSocial),
      siegeAdresse: eprouverSiegeAdresse(props.siegeAdresse),
      secteurActivite: eprouverSecteurActivite(props.secteurActivite),
      representantId: eprouverRepresentantId(props.representantId),
    });
  }
}
