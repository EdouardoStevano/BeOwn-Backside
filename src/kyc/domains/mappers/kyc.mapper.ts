import { Kyc, KycSnapshot, KycSnapshotBrut } from 'src/kyc/domains/kyc';
import { DecisionKyc } from 'src/kyc/domains/value-objects/decision-kyc.vo';

/**
 * Traductions entre le dossier KYC et sa représentation de persistance
 * (`KycSnapshot`, faite de primitives et à plat).
 *
 * Même rôle et mêmes raisons que `ProfilPPMapper` : changer la forme de
 * stockage ou ajouter une projection ne doit pas rouvrir l'agrégat (§4 — SRP).
 *
 * Homonyme partiel du mapper de `infrastructure/persistences/mappers/`, sans
 * recouvrement : celui-là traduit vers TypeORM et ne connaît que des entités
 * ORM ; celui-ci reste dans le domaine et n'a aucune dépendance technique.
 * C'est le mapper d'infrastructure qui appelle celui-ci.
 */
export class KycMapper {
  /**
   * Reconstitution depuis la persistance, **sans contrôle**.
   *
   * Une ligne écrite avant qu'une règle n'existe doit rester lisible : valider
   * au chargement rendrait le dossier inaccessible, y compris pour corriger la
   * donnée fautive. La validation s'applique là où une valeur **entre**, c'est
   * à dire dans `KycFactory.creer`.
   */
  static restore(snapshot: KycSnapshotBrut): Kyc {
    return new Kyc({
      entete: {
        id: snapshot.id,
        utilisateurId: snapshot.utilisateurId,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
      decision: DecisionKyc.restore(snapshot),
      niveau: snapshot.niveau,
      scoreRisque: snapshot.scoreRisque ?? null,
      fournisseur: snapshot.fournisseur,
      fournisseurRef: snapshot.fournisseurRef ?? null,
      stripeReportId: snapshot.stripeReportId ?? null,
      // Copie : le `jsonb` rendu par TypeORM appartient à l'entité ORM, et un
      // agrégat qui garde une référence dessus n'est immuable qu'en apparence.
      identiteExtrait: snapshot.identiteExtrait
        ? { ...snapshot.identiteExtrait }
        : null,
    });
  }

  /**
   * État complet, en primitives et à plat — destiné aux mappers de persistance
   * et à la sérialisation HTTP.
   *
   * Ne contient que ce dont le dossier est propriétaire. Le titulaire, que la
   * liste d'administration affiche à côté, est ajouté par-dessus au moment de
   * répondre (`GetKycUseCase.executeAll`) — il appartient à IAM.
   */
  static toSnapshot(kyc: Kyc): KycSnapshot {
    return {
      id: kyc.id,
      utilisateurId: kyc.utilisateurId,
      niveau: kyc.niveau,
      scoreRisque: kyc.scoreRisque,
      fournisseur: kyc.fournisseur,
      fournisseurRef: kyc.fournisseurRef,
      stripeReportId: kyc.stripeReportId,
      identiteExtrait: kyc.identiteExtrait,
      createdAt: kyc.createdAt,
      updatedAt: kyc.updatedAt,
      ...kyc.decision.toSnapshot(),
    };
  }
}
