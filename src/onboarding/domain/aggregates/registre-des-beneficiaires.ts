import {
  BeneficiaireEffectif,
  BeneficiaireEffectifSnapshot,
  ChampsBeneficiaire,
} from '../entities/beneficiaire-effectif';
import {
  BeneficiaireEffectifIntrouvableError,
  DetentionDirecteExcessiveError,
} from '../errors/beneficiaire-effectif.errors';

/** Au-delà, les parts déclarées excèdent le capital de la société. */
const CAPITAL_TOTAL = 100;

/**
 * Les bénéficiaires effectifs d'une société — qui la contrôle réellement.
 *
 * Le cahier des charges les définit comme *« les actionnaires possédant 25 % et
 * plus des parts de la société de manière directe ou indirecte »*, à déclarer
 * par un formulaire DBE-S1 accompagné d'une pièce d'identité par personne.
 *
 * **Un agrégat dédié**, comme `DossierDePieces` et pour la même raison (§6) :
 * l'invariant porte sur **l'ensemble** des déclarations, pas sur une seule. Les
 * parts détenues en direct se partagent un capital unique, donc leur somme ne
 * peut pas dépasser 100 % — trois associés à 40 % chacun est arithmétiquement
 * impossible, et un registre qui l'accepte produit un DBE-S1 que le greffe
 * rejettera. Le vérifier demande de tenir toutes les lignes ensemble ; le faire
 * porter par `ProfilPM` obligerait à les charger pour lire une raison sociale.
 *
 * **Seules les directes sont plafonnées.** Les indirectes se superposent : une
 * personne qui contrôle une holding détenant 60 % de la société est
 * bénéficiaire à 60 % indirects, part qui recouvre celle de la holding
 * elle-même. Les additionner toutes ferait refuser des registres réguliers —
 * c'est précisément la distinction que le modèle ignorait.
 *
 * Ce que le registre ne porte pas : les **pièces d'identité** des
 * bénéficiaires. Elles vivent dans `DossierDePieces`, qui les rattache par
 * `beneficiaireId` — un justificatif a son propre cycle d'instruction, et le
 * charger ici pour déclarer une part n'aurait aucun sens (§6.1).
 */
export class RegistreDesBeneficiaires {
  private readonly _societeId: string;
  private readonly _beneficiaires: BeneficiaireEffectif[];

  /**
   * @internal Réservé au repository, qui compose le registre depuis sa table.
   * Il n'éprouve rien : les invariants sont posés à la déclaration.
   */
  constructor(etat: {
    societeId: string;
    beneficiaires: BeneficiaireEffectif[];
  }) {
    this._societeId = etat.societeId;
    this._beneficiaires = [...etat.beneficiaires];
  }

  /** Une société dont aucun bénéficiaire n'a encore été déclaré. */
  static vierge(societeId: string): RegistreDesBeneficiaires {
    return new RegistreDesBeneficiaires({ societeId, beneficiaires: [] });
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Déclare un bénéficiaire de plus.
   *
   * L'entité est construite **avant** le contrôle du total : une part hors
   * bornes ou une nationalité inconnue est refusée par ses Value Objects, et le
   * registre n'a alors rien à défaire. Le total n'est éprouvé qu'ensuite, sur
   * une déclaration déjà valide prise isolément.
   *
   * @throws DetentionDirecteExcessiveError si les parts directes dépasseraient
   *   le capital.
   */
  declarer(
    champs: ChampsBeneficiaire,
    maintenant: Date = new Date(),
  ): BeneficiaireEffectif {
    const beneficiaire = BeneficiaireEffectif.declarer(champs, maintenant);

    if (beneficiaire.estDirecte()) {
      const total =
        this.totalDetentionDirecte() + beneficiaire.pourcentageDetention.value;

      if (total > CAPITAL_TOTAL) {
        throw new DetentionDirecteExcessiveError(
          arrondiAuCentieme(total),
          beneficiaire.pourcentageDetention.value,
        );
      }
    }

    this._beneficiaires.push(beneficiaire);
    return beneficiaire;
  }

  /**
   * Retire un bénéficiaire du registre.
   *
   * Passe par la racine, et non par une suppression directe en base : c'est
   * elle qui sait que ce bénéficiaire est bien de cette société. Sans ce
   * passage, l'identifiant d'une personne déclarée ailleurs suffirait à
   * l'effacer — ce que l'ancien contrôleur évitait à la main, en glissant
   * `profilPMId` dans le critère de suppression.
   */
  retirer(beneficiaireId: string): BeneficiaireEffectif {
    const beneficiaire = this.beneficiaire(beneficiaireId);
    const rang = this._beneficiaires.indexOf(beneficiaire);
    this._beneficiaires.splice(rang, 1);
    return beneficiaire;
  }

  // ── Règles propres au registre ────────────────────────────────────────────

  /**
   * Somme des parts détenues **en direct**, arrondie au centième.
   *
   * Les indirectes en sont exclues : elles recouvrent d'autres participations
   * et ne se partagent pas le capital.
   */
  totalDetentionDirecte(): number {
    return arrondiAuCentieme(
      this._beneficiaires
        .filter((b) => b.estDirecte())
        .reduce((somme, b) => somme + b.pourcentageDetention.value, 0),
    );
  }

  /** `true` tant qu'aucun bénéficiaire n'a été déclaré. */
  estVide(): boolean {
    return this._beneficiaires.length === 0;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get societeId(): string {
    return this._societeId;
  }

  /**
   * Un bénéficiaire du registre, par son identité.
   *
   * @throws BeneficiaireEffectifIntrouvableError s'il n'est pas d'ici. Le
   *   message ne distingue pas « n'existe pas » de « appartient à une autre
   *   société » : le dire confirmerait l'existence d'un identifiant à qui n'y a
   *   pas droit.
   */
  beneficiaire(beneficiaireId: string): BeneficiaireEffectif {
    // Une déclaration qui n'a pas encore été enregistrée n'a pas d'identité —
    // chercher par un identifiant vide ferait correspondre `undefined ===
    // undefined` et rendrait la première d'entre elles (cf. `DossierDePieces`).
    if (!beneficiaireId) {
      throw new BeneficiaireEffectifIntrouvableError(beneficiaireId);
    }

    const beneficiaire = this._beneficiaires.find(
      (candidat) => !!candidat.id && candidat.id === beneficiaireId,
    );
    if (!beneficiaire) {
      throw new BeneficiaireEffectifIntrouvableError(beneficiaireId);
    }
    return beneficiaire;
  }

  /** Le registre tel qu'il se publie — des primitives, pas les entités. */
  get beneficiairesPublies(): BeneficiaireEffectifSnapshot[] {
    return this._beneficiaires.map((b) => b.toSnapshot());
  }

  /**
   * @internal Réservé au repository, qui range chaque déclaration dans sa
   * ligne. Une porte nommée, là où un getter ordinaire se lirait comme une API
   * et rendrait les entités modifiables hors de leur racine.
   */
  get beneficiaires(): readonly BeneficiaireEffectif[] {
    return this._beneficiaires;
  }
}

/** L'arithmétique flottante ajoute des décimales que la colonne n'a pas. */
function arrondiAuCentieme(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}
