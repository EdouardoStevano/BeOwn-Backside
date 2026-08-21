import {
  ProfilPM,
  ProfilPMSnapshot,
  ProfilPMSnapshotBrut,
} from 'src/compliance/domain/aggregates/profil-pm';
import { CapitalSocial } from 'src/compliance/domain/value-objects/capital-social.vo';
import { IdentiteLegale } from 'src/compliance/domain/value-objects/identite-legale.vo';
import { Libelle } from 'src/compliance/domain/value-objects/libelle.vo';

/**
 * Traductions entre le profil moral et sa représentation de persistance
 * (`ProfilPMSnapshot`, faite de primitives et à plat).
 *
 * Même rôle et mêmes raisons que `ProfilPPMapper` : changer la forme de
 * stockage ou ajouter une projection ne doit pas rouvrir l'agrégat (§4 — SRP).
 *
 * Homonyme partiel du mapper de `infrastructure/persistences/mappers/`, sans
 * recouvrement : celui-là traduit vers TypeORM et ne connaît que des entités
 * ORM ; celui-ci reste dans le domaine et n'a aucune dépendance technique.
 * C'est d'ailleurs le mapper d'infrastructure qui appelle celui-ci.
 */
export class ProfilPMMapper {
  /**
   * Reconstitution depuis la persistance, **sans contrôle**.
   *
   * Le bloc et chaque Value Object passent par leur `restore` et non par leur
   * `of` : une ligne écrite avant que la règle n'existe doit rester lisible.
   * Valider au chargement rendrait le profil inaccessible — y compris pour
   * corriger un SIREN fautif. La validation s'applique là où une valeur
   * **entre** : `ProfilPMFactory.creer`.
   */
  static restore(snapshot: ProfilPMSnapshotBrut): ProfilPM {
    return new ProfilPM({
      entete: {
        utilisateurId: snapshot.utilisateurId,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
      identiteLegale: IdentiteLegale.restore(snapshot),
      // `restore` convertit tout de même la chaîne que rend le driver pour une
      // colonne `decimal` : sans cela le domaine exposerait un `string` là où
      // son type annonce un `number`, et le front recevrait « 50000.00 » entre
      // guillemets.
      capitalSocial: CapitalSocial.restore(snapshot.capitalSocial),
      siegeAdresse: Libelle.restore(snapshot.siegeAdresse),
      secteurActivite: Libelle.restore(snapshot.secteurActivite),
      representantId: snapshot.representantId,
    });
  }

  /**
   * État complet, en primitives et à plat — destiné au mapper de persistance
   * et à la sérialisation HTTP.
   *
   * Assemblé depuis le snapshot du bloc et les valeurs restantes : le
   * découpage interne n'a aucun effet sur le contrat de persistance ni sur le
   * JSON renvoyé, et le compilateur le garantit — `ProfilPMSnapshot` est
   * lui-même composé de `IdentiteLegaleSnapshot`.
   */
  static toSnapshot(profil: ProfilPM): ProfilPMSnapshot {
    return {
      utilisateurId: profil.utilisateurId,
      createdAt: profil.createdAt,
      updatedAt: profil.updatedAt,
      ...profil.identiteLegale.toSnapshot(),
      capitalSocial: profil.capitalSocial,
      siegeAdresse: profil.siegeAdresse,
      secteurActivite: profil.secteurActivite,
      representantId: profil.representantId,
    };
  }
}
