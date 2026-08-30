import { ModeDeDetention } from '../enums/mode-de-detention.enum';
import { ChampProfilInvalideError } from '../errors/champ-profil.errors';
import { CodePays } from '../value-objects/code-pays.vo';
import { DateNaissance } from '../value-objects/date-naissance.vo';
import { NomPersonne } from '../value-objects/nom-personne.vo';
import { PourcentageDetention } from '../value-objects/pourcentage-detention.vo';

/** Ce que le titulaire déclare d'un bénéficiaire effectif. */
export interface ChampsBeneficiaire {
  prenom?: string | null;
  nom?: string | null;
  /** Chaîne ISO `AAAA-MM-JJ` (DTO) ou `Date` (import, script). */
  dateNaissance?: string | Date | null;
  nationalite?: string | null;
  pourcentageDetention?: number | string | null;
  modeDetention?: ModeDeDetention | null;
}

export interface BeneficiaireEffectifSnapshot {
  /** Identité propre, attribuée par la persistance. */
  id: string;
  prenom: string;
  nom: string;
  dateNaissance: string | null;
  nationalite: string | null;
  pourcentageDetention: number;
  modeDetention: ModeDeDetention;
  createdAt: Date;
}

/**
 * Une personne physique détenant 25 % ou plus d'une société.
 *
 * **Une entité, pas un Value Object** : elle a une identité stable, une pièce
 * d'identité qui la documente (`PieceJustificative.beneficiaireId`), et deux
 * homonymes peuvent coexister sans être la même personne (§7).
 *
 * Il n'existait aucun modèle de domaine pour ce concept. Le contrôleur HTTP
 * injectait `Repository<BeneficiaireEffectifEntity>` et faisait `create` /
 * `save` / `delete` lui-même, si bien que les seules règles écrites — le seuil
 * de 25 %, la borne à 100 % — vivaient dans des décorateurs `class-validator`
 * du DTO, c'est-à-dire dans la couche HTTP (§14, §27). Ni le prénom ni le nom
 * n'étaient éprouvés, la nationalité acceptait n'importe quelle chaîne, et le
 * pourcentage entrait tel quel dans la ligne.
 *
 * `prenom` et `nom` sont **obligatoires** : c'est le minimum pour rapprocher
 * cette déclaration de la pièce d'identité qui doit l'accompagner. Le reste ne
 * l'est pas — la date de naissance et la nationalité se lisent sur la pièce, et
 * les exiger à la déclaration bloquerait un registre qu'on peut compléter
 * ensuite.
 *
 * Elle n'est atteignable qu'à travers {@link RegistreDesBeneficiaires}, sa
 * racine : une part isolée ne dit pas si le capital tient, et c'est
 * l'invariant que le métier oppose (§6).
 */
export class BeneficiaireEffectif {
  private readonly _id: string;
  private _prenom: NomPersonne;
  private _nom: NomPersonne;
  private _dateNaissance: DateNaissance | null;
  private _nationalite: CodePays | null;
  private _pourcentage: PourcentageDetention;
  private _mode: ModeDeDetention;
  private readonly _createdAt: Date;

  /**
   * @internal Réservé à {@link RegistreDesBeneficiaires} et au mapper.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie. Y passer, c'est
   * se déclarer racine ou mapper, et prendre à sa charge les invariants que
   * l'une pose et que l'autre assume de ne pas rejouer.
   */
  constructor(etat: {
    id: string;
    prenom: NomPersonne;
    nom: NomPersonne;
    dateNaissance: DateNaissance | null;
    nationalite: CodePays | null;
    pourcentage: PourcentageDetention;
    mode: ModeDeDetention;
    createdAt: Date;
  }) {
    this._id = etat.id;
    this._prenom = etat.prenom;
    this._nom = etat.nom;
    this._dateNaissance = etat.dateNaissance;
    this._nationalite = etat.nationalite;
    this._pourcentage = etat.pourcentage;
    this._mode = etat.mode;
    this._createdAt = etat.createdAt;
  }

  /**
   * Déclaration d'un bénéficiaire, éprouvée champ par champ.
   *
   * Tout est construit avant la moindre affectation : une nationalité inconnue
   * ou une part hors bornes laisse le registre exactement dans l'état où il
   * était, plutôt qu'à moitié écrit.
   */
  static declarer(
    champs: ChampsBeneficiaire,
    maintenant: Date = new Date(),
  ): BeneficiaireEffectif {
    return new BeneficiaireEffectif({
      // Attribuée par la persistance, comme partout dans ce contexte.
      id: undefined as unknown as string,
      prenom: exigerNom(champs.prenom, 'Le prénom du bénéficiaire', 'prenom'),
      nom: exigerNom(champs.nom, 'Le nom du bénéficiaire', 'nom'),
      dateNaissance: DateNaissance.of(champs.dateNaissance),
      nationalite: CodePays.of(
        champs.nationalite,
        'La nationalité du bénéficiaire',
        'nationalite',
      ),
      pourcentage: PourcentageDetention.of(champs.pourcentageDetention),
      // La détention directe est le cas ordinaire — c'est celle qu'on déclare
      // en remplissant un DBE-S1 sans schéma de participation.
      mode: champs.modeDetention ?? ModeDeDetention.DIRECTE,
      createdAt: maintenant,
    });
  }

  // ── Règles propres au bénéficiaire ────────────────────────────────────────

  estDirecte(): boolean {
    return this._mode === ModeDeDetention.DIRECTE;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get id(): string {
    return this._id;
  }
  get prenom(): string {
    return this._prenom.value;
  }
  get nom(): string {
    return this._nom.value;
  }
  get pourcentageDetention(): PourcentageDetention {
    return this._pourcentage;
  }
  get modeDetention(): ModeDeDetention {
    return this._mode;
  }
  get createdAt(): Date {
    return this._createdAt;
  }

  /** Nom d'usage, tel qu'il s'affiche dans une liste ou un message. */
  get nomComplet(): string {
    return `${this._prenom.value} ${this._nom.value}`;
  }

  toSnapshot(): BeneficiaireEffectifSnapshot {
    return {
      id: this._id,
      prenom: this._prenom.value,
      nom: this._nom.value,
      dateNaissance: this._dateNaissance?.value ?? null,
      nationalite: this._nationalite?.value ?? null,
      pourcentageDetention: this._pourcentage.value,
      modeDetention: this._mode,
      createdAt: this._createdAt,
    };
  }
}

/**
 * `NomPersonne.of` rend `null` sur une chaîne vide — il sert des champs
 * facultatifs ailleurs. Ici les deux noms sont exigés : sans eux, la
 * déclaration ne désigne personne et ne peut être rapprochée d'aucune pièce
 * d'identité.
 */
function exigerNom(
  raw: string | null | undefined,
  label: string,
  field: string,
): NomPersonne {
  const nom = NomPersonne.of(raw, label, field);
  if (nom === null) {
    throw new ChampProfilInvalideError(label, 'est obligatoire.', field);
  }
  return nom;
}
