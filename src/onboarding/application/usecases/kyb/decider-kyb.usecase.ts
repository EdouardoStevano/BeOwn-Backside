import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/onboarding/domain/repositories/profil-pm.repository';
import { ProfilPMIntrouvableError } from 'src/onboarding/domain/errors';
import {
  KybRefuseDomainEvent,
  KybValideDomainEvent,
} from 'src/onboarding/domain/events/kyb-tranche.domain-event';
import { StatutKyb } from 'src/onboarding/domain/enums/statut-kyb.enum';

/** Ce que l'instruction d'un dossier KYB rend à l'écran d'administration. */
export interface VerdictKyb {
  societeId: string;
  statut: StatutKyb;
  motifRefus: string | null;
  valideJusquAu: string | null;
}

/**
 * Décision humaine sur le dossier KYB d'une société.
 *
 * Le pendant moral de {@link DecideKycManualReviewUseCase} : le titulaire
 * réunit ses justificatifs, l'équipe conformité tranche. C'est ici que le
 * verdict devient **opposable** — daté, signé, et lu tel quel par
 * `peutOperer()` plutôt que recalculé à chaque lecture.
 *
 * **La garde d'état n'est pas ici, elle est dans le domaine.**
 * `DecisionKyb.validee` refuse tout dossier qui n'est pas en instruction (voir
 * {@link KybPasEnInstructionError}), et `DossierDEntreeEnRelation` refuse tout
 * dossier de personne physique. Ce use case n'orchestre que des accès (§14) :
 * retrouver la société, charger sa racine, appeler la transition, persister,
 * annoncer.
 *
 * **La décision est humaine, et c'est le processus retenu — pas un provisoire.**
 * Le partage entre l'automatique et le manuel est net, et il ne bouge pas :
 *
 * | Ce qui est vérifié                  | Par qui                        |
 * | ----------------------------------- | ------------------------------ |
 * | l'identité d'une personne physique  | Stripe Identity, par webhook   |
 * | les justificatifs d'une société     | l'équipe conformité de BeOwn   |
 *
 * **Stripe ne vérifie aucun KYB ici.** Son parcours Connect Express couvre le
 * compte du représentant légal — un compte par titulaire, pas un par société —
 * et rien ne lui pousse `piece_justificative` : il n'accepte pas qu'on lui
 * soumette des pièces hors de son propre parcours hébergé.
 *
 * Le cahier des charges annonce l'inverse (« les documents sont automatiquement
 * envoyés au PSP pour validation ») ; c'est un écart assumé, arrêté avec le
 * métier. Ne pas « rétablir » cette automatisation en branchant un webhook
 * Stripe sur ces deux méthodes : un compte Connect vaut pour toutes les
 * sociétés d'un même titulaire, donc son verdict ne saurait pas laquelle il
 * valide.
 *
 * **L'autorisation n'est pas ici.** Vérifier que l'appelant détient
 * `kyc:validate` reste l'affaire de la présentation — c'est une question
 * d'identité, pas de dossier.
 */
@Injectable()
export class DeciderKybUseCase {
  constructor(
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly societes: ProfilPMRepository,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * @param valideJusquAu échéance de la validité, ou `null` sans terme. Elle est
   *   **saisie par l'agent** et non calculée : la cadence de re-vérification
   *   d'une personne morale n'est arrêtée nulle part, et l'inventer ferait
   *   expirer des dossiers selon une règle que personne n'a écrite.
   * @throws KybPasEnInstructionError si le dossier n'est pas en instruction.
   */
  async valider(
    societeId: string,
    valideJusquAu: string | null,
    decidePar: number,
  ): Promise<VerdictKyb> {
    const { profil, utilisateurId } = await this.chargerLaSociete(societeId);

    profil.validerLeKyb(valideJusquAu, decidePar);
    const enregistre = await this.profils.save(profil);

    // Publié après l'écriture : un abonné ne doit pas annoncer au titulaire une
    // habilitation qui n'a pas eu lieu.
    this.eventBus.publish(
      new KybValideDomainEvent(
        utilisateurId,
        societeId,
        enregistre.kybValideJusquAu,
        decidePar,
      ),
    );

    return verdict(societeId, enregistre);
  }

  /** @throws KybPasEnInstructionError si le dossier n'est pas en instruction. */
  async refuser(
    societeId: string,
    motif: string,
    decidePar: number,
  ): Promise<VerdictKyb> {
    const { profil, utilisateurId } = await this.chargerLaSociete(societeId);

    profil.refuserLeKyb(motif, decidePar);
    const enregistre = await this.profils.save(profil);

    this.eventBus.publish(
      new KybRefuseDomainEvent(utilisateurId, societeId, motif, decidePar),
    );

    return verdict(societeId, enregistre);
  }

  /**
   * La racine de conformité de cette société, et le compte qui la déclare.
   *
   * Le profil moral est relu d'abord parce qu'il porte `userId` : le dossier de
   * conformité d'une société est clé sur le couple, et le charger sans le
   * titulaire rendrait la racine d'un autre compte — ou une racine vierge.
   *
   * @throws ProfilPMIntrouvableError si la société n'existe pas.
   */
  private async chargerLaSociete(societeId: string) {
    const societe = await this.societes.findById(societeId);
    if (!societe) throw new ProfilPMIntrouvableError();

    const profil = await this.profils.parSociete(societe.userId, societeId);

    return { profil, utilisateurId: societe.userId };
  }
}

function verdict(
  societeId: string,
  profil: {
    statutKyb: StatutKyb | null;
    motifRefusKyb: string | null;
    kybValideJusquAu: string | null;
  },
): VerdictKyb {
  return {
    societeId,
    // Non nul par construction : la racine vient de `parSociete`.
    statut: profil.statutKyb as StatutKyb,
    motifRefus: profil.motifRefusKyb,
    valideJusquAu: profil.kybValideJusquAu,
  };
}
