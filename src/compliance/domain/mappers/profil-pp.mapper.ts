import {
  ProfilPP,
  ProfilPPSnapshot,
  ProfilPPSnapshotBrut,
} from 'src/compliance/domain/aggregates/profil-pp';
import { Coordonnees } from 'src/compliance/domain/value-objects/coordonnees.vo';
import { EvaluationInvestisseur } from 'src/compliance/domain/value-objects/evaluation-investisseur.vo';
import { Identite } from 'src/compliance/domain/value-objects/identite.vo';
import { SituationFiscale } from 'src/compliance/domain/value-objects/situation-fiscale.vo';
import { SituationProfessionnelle } from 'src/compliance/domain/value-objects/situation-professionnelle.vo';

/**
 * Traductions entre le profil et sa représentation de persistance
 * (`ProfilPPSnapshot`, faite de primitives et à plat).
 *
 * `ProfilPP` portait ces deux méthodes en plus de ses règles métier : changer
 * la forme de stockage rouvrait l'agrégat, et ajouter une projection — vue
 * admin, export réglementaire, résumé pour la compliance — l'aurait rouvert à
 * chaque fois. Elles vivent ici, à côté de la fabrique, comme dans le contexte
 * IAM (§4 — SRP).
 *
 * Homonyme du mapper de `infrastructure/persistences/mappers/`, sans
 * recouvrement : celui-là traduit vers TypeORM et ne connaît que des entités
 * ORM ; celui-ci reste dans le domaine et n'a aucune dépendance technique.
 * C'est d'ailleurs le mapper d'infrastructure qui appelle celui-ci.
 */
export class ProfilPPMapper {
  /**
   * Reconstitution depuis la persistance, **sans contrôle**.
   *
   * Chaque bloc passe par son `restore` et non par son `declarer` : une ligne
   * écrite avant que la règle n'existe doit rester lisible. Valider au
   * chargement rendrait le profil inaccessible — y compris pour corriger la
   * donnée fautive. La validation s'applique là où une valeur **entre** :
   * `ProfilPPFactory.creer` et `ProfilPP.mettreAJour`.
   *
   * Le snapshot d'entrée tolère les formes que rend réellement le driver
   * Postgres — chaîne pour une colonne `date`, chaîne pour une colonne
   * `decimal`. Chaque bloc absorbe celles qui le concernent, de sorte que le
   * mapper d'infrastructure n'ait pas à les connaître.
   */
  static restore(snapshot: ProfilPPSnapshotBrut): ProfilPP {
    return new ProfilPP({
      entete: {
        id: snapshot.id,
        userId: snapshot.userId,
        pep: snapshot.pep === true,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
      identite: Identite.restore(snapshot),
      coordonnees: Coordonnees.restore(snapshot),
      situationProfessionnelle: SituationProfessionnelle.restore(snapshot),
      situationFiscale: SituationFiscale.restore(snapshot),
      evaluation: EvaluationInvestisseur.restore(snapshot),
    });
  }

  /**
   * État complet, en primitives et à plat — destiné aux mappers de persistance
   * et à la sérialisation HTTP.
   *
   * Assemblé depuis le snapshot de chaque bloc : le découpage interne de
   * l'agrégat n'a donc aucun effet sur le contrat de persistance ni sur le JSON
   * renvoyé au front, et le compilateur le garantit — `ProfilPPSnapshot` est
   * lui-même composé des snapshots de blocs.
   */
  static toSnapshot(profil: ProfilPP): ProfilPPSnapshot {
    return {
      id: profil.id,
      userId: profil.userId,
      pep: profil.pep,
      createdAt: profil.createdAt,
      updatedAt: profil.updatedAt,
      ...profil.identite.toSnapshot(),
      ...profil.coordonnees.toSnapshot(),
      ...profil.situationProfessionnelle.toSnapshot(),
      ...profil.situationFiscale.toSnapshot(),
      ...profil.evaluation.toSnapshot(),
    };
  }
}
