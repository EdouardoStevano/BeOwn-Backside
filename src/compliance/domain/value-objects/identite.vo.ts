import { siDeclare } from './champ-declare';
import { Civilite, parseCivilite, restoreCivilite } from './civilite.vo';
import { CodePays } from './code-pays.vo';
import { DateNaissance } from './date-naissance.vo';
import { Libelle } from './libelle.vo';
import { NomPersonne } from './nom-personne.vo';

/** Longueur d'un libellé de lieu — commune de naissance. */
const MAX_LIEU = 100;

/** Part de l'identité que le titulaire déclare lui-même. */
export interface ChampsIdentite {
  civilite?: string | null;
  nomNaissance?: string | null;
  /** Chaîne ISO `AAAA-MM-JJ` (DTO) ou `Date` (import, script). */
  dateNaissance?: string | Date | null;
  lieuNaissance?: string | null;
  paysNaissance?: string | null;
  nationalite?: string | null;
}

export interface IdentiteSnapshot {
  civilite: string | null;
  nomNaissance: string | null;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  paysNaissance: string | null;
  nationalite: string | null;
}

/** Le driver rend une colonne `date` en chaîne, malgré le type de l'entité. */
export interface IdentiteSnapshotBrut extends Omit<
  IdentiteSnapshot,
  'dateNaissance'
> {
  dateNaissance: string | Date | null;
}

interface EtatIdentite {
  civilite: Civilite | null;
  nomNaissance: NomPersonne | null;
  dateNaissance: DateNaissance | null;
  lieuNaissance: Libelle | null;
  paysNaissance: CodePays | null;
  nationalite: CodePays | null;
}

/**
 * État civil du titulaire du profil.
 *
 * Regroupe ce que le titulaire déclare de son état civil : civilité, nom de
 * naissance, naissance, nationalité. Son **prénom et son nom** n'y sont plus :
 * ils étaient recopiés du compte à la création, jamais modifiables depuis le
 * formulaire, et dupliquaient donc `user.firstname` / `user.lastname` — deux
 * vérités sur la même personne, dont une seule bougeait au renommage. C'est le bloc que le KYC rapproche de la pièce
 * d'identité, ce qui explique qu'il tienne ensemble — un rapprochement porte
 * sur l'ensemble, jamais sur un champ isolé.
 *
 * **Immuable** : {@link avec} rend une nouvelle identité plutôt que de modifier
 * celle-ci. L'agrégat remplace donc sa référence, et comparer l'avant et
 * l'après pour savoir si quelque chose a bougé devient une simple égalité de
 * valeurs — là où il fallait auparavant sérialiser tout le profil.
 */
export class Identite {
  private constructor(private readonly etat: EtatIdentite) {}

  /** Première déclaration : tout vient du formulaire de complétion. */
  static declarer(champs: ChampsIdentite = {}): Identite {
    return new Identite({
      civilite: parseCivilite(champs.civilite),
      nomNaissance: NomPersonne.of(
        champs.nomNaissance,
        'Le nom de naissance',
        'nomNaissance',
      ),
      dateNaissance: DateNaissance.of(champs.dateNaissance),
      lieuNaissance: Libelle.of(
        champs.lieuNaissance,
        'Le lieu de naissance',
        'lieuNaissance',
        MAX_LIEU,
      ),
      paysNaissance: CodePays.of(
        champs.paysNaissance,
        'Le pays de naissance',
        'paysNaissance',
      ),
      nationalite: CodePays.of(
        champs.nationalite,
        'La nationalité',
        'nationalite',
      ),
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: IdentiteSnapshotBrut): Identite {
    return new Identite({
      civilite: restoreCivilite(snapshot.civilite),
      nomNaissance: NomPersonne.restore(snapshot.nomNaissance),
      dateNaissance: DateNaissance.restore(snapshot.dateNaissance),
      lieuNaissance: Libelle.restore(snapshot.lieuNaissance),
      paysNaissance: CodePays.restore(snapshot.paysNaissance),
      nationalite: CodePays.restore(snapshot.nationalite),
    });
  }

  /** Identité révisée. */
  avec(champs: ChampsIdentite): Identite {
    return new Identite({
      civilite: siDeclare(champs.civilite, parseCivilite, this.etat.civilite),
      nomNaissance: siDeclare(
        champs.nomNaissance,
        (v) => NomPersonne.of(v, 'Le nom de naissance', 'nomNaissance'),
        this.etat.nomNaissance,
      ),
      dateNaissance: siDeclare(
        champs.dateNaissance,
        (v) => DateNaissance.of(v),
        this.etat.dateNaissance,
      ),
      lieuNaissance: siDeclare(
        champs.lieuNaissance,
        (v) => Libelle.of(v, 'Le lieu de naissance', 'lieuNaissance', MAX_LIEU),
        this.etat.lieuNaissance,
      ),
      paysNaissance: siDeclare(
        champs.paysNaissance,
        (v) => CodePays.of(v, 'Le pays de naissance', 'paysNaissance'),
        this.etat.paysNaissance,
      ),
      nationalite: siDeclare(
        champs.nationalite,
        (v) => CodePays.of(v, 'La nationalité', 'nationalite'),
        this.etat.nationalite,
      ),
    });
  }

  /** Âge en années révolues, `null` si la date de naissance n'est pas connue. */
  age(): number | null {
    return this.etat.dateNaissance?.age() ?? null;
  }

  get civilite(): string | null {
    return this.etat.civilite;
  }
  get nomNaissance(): string | null {
    return this.etat.nomNaissance?.value ?? null;
  }
  /** Date civile `AAAA-MM-JJ` — voir `DateNaissance` sur l'absence de fuseau. */
  get dateNaissance(): string | null {
    return this.etat.dateNaissance?.value ?? null;
  }
  get lieuNaissance(): string | null {
    return this.etat.lieuNaissance?.value ?? null;
  }
  get paysNaissance(): string | null {
    return this.etat.paysNaissance?.value ?? null;
  }
  get nationalite(): string | null {
    return this.etat.nationalite?.value ?? null;
  }

  /** Égalité par valeur — un VO n'a pas d'identité. */
  equals(other: Identite): boolean {
    return (
      this.civilite === other.civilite &&
      this.nomNaissance === other.nomNaissance &&
      this.dateNaissance === other.dateNaissance &&
      this.lieuNaissance === other.lieuNaissance &&
      this.paysNaissance === other.paysNaissance &&
      this.nationalite === other.nationalite
    );
  }

  toSnapshot(): IdentiteSnapshot {
    return {
      civilite: this.civilite,
      nomNaissance: this.nomNaissance,
      dateNaissance: this.dateNaissance,
      lieuNaissance: this.lieuNaissance,
      paysNaissance: this.paysNaissance,
      nationalite: this.nationalite,
    };
  }
}

/** Nom ou prénom repris du compte, avec repli sur le marqueur. */
