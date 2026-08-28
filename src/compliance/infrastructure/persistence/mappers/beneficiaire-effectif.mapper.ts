import { BeneficiaireEffectif } from 'src/compliance/domain/entities/beneficiaire-effectif';
import { CodePays } from 'src/compliance/domain/value-objects/code-pays.vo';
import { DateNaissance } from 'src/compliance/domain/value-objects/date-naissance.vo';
import { NomPersonne } from 'src/compliance/domain/value-objects/nom-personne.vo';
import { PourcentageDetention } from 'src/compliance/domain/value-objects/pourcentage-detention.vo';
import { BeneficiaireEffectifEntity } from '../entities/beneficiaire-effectif.entity';

/**
 * Traductions entre le bénéficiaire effectif et sa ligne.
 *
 * Même rôle et mêmes raisons que `ProfilMapper` : la forme de stockage peut
 * changer sans rouvrir l'entité (§16).
 */
export class BeneficiaireEffectifOrmMapper {
  /**
   * Reconstitution **sans contrôle** : une ligne écrite avant que les règles
   * n'existent doit rester lisible. Refuser au chargement rendrait le registre
   * inaccessible — y compris pour corriger la déclaration fautive.
   *
   * C'est ici que ça compte le plus : jusqu'à ce refactoring, aucune ligne
   * n'avait été éprouvée. Une nationalité hors ISO 3166 ou un prénom vide sont
   * donc plausibles en base, et `restore` les relit tels quels.
   */
  static toDomain(entity: BeneficiaireEffectifEntity): BeneficiaireEffectif {
    return new BeneficiaireEffectif({
      id: entity.id,
      prenom: NomPersonne.restore(entity.prenom) as NomPersonne,
      nom: NomPersonne.restore(entity.nom) as NomPersonne,
      dateNaissance: DateNaissance.restore(entity.dateNaissance),
      nationalite: CodePays.restore(entity.nationalite),
      pourcentage: PourcentageDetention.restore(entity.pourcentageDetention),
      mode: entity.modeDetention,
      createdAt: entity.createdAt,
    });
  }

  /** `profilPMId` vient du repository : l'entité ne connaît pas sa racine (§6). */
  static toEntity(
    beneficiaire: BeneficiaireEffectif,
    societeId: string,
  ): BeneficiaireEffectifEntity {
    const snapshot = beneficiaire.toSnapshot();
    const entity = new BeneficiaireEffectifEntity();

    // Absent d'une première déclaration : l'uuid est généré en base.
    if (snapshot.id) entity.id = snapshot.id;
    entity.profilPMId = societeId;
    entity.prenom = snapshot.prenom;
    entity.nom = snapshot.nom;
    entity.dateNaissance = snapshot.dateNaissance
      ? new Date(snapshot.dateNaissance)
      : null;
    entity.nationalite = snapshot.nationalite;
    entity.pourcentageDetention = snapshot.pourcentageDetention;
    entity.modeDetention = snapshot.modeDetention;

    return entity;
  }
}
