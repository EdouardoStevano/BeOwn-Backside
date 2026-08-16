import { siDeclare } from './champ-declare';
import { Civilite, parseCivilite, restoreCivilite } from './civilite.vo';
import { CodePays } from './code-pays.vo';
import { DateNaissance } from './date-naissance.vo';
import { Libelle } from './libelle.vo';
import { NomPersonne } from './nom-personne.vo';

/** Longueur d'un libellé de lieu — commune de naissance. */
const MAX_LIEU = 100;

/**
 * Marqueur d'identité manquante.
 *
 * `prenom` et `nom` sont NOT NULL en base mais ne sont pas redemandés par le
 * formulaire de complétion : ils viennent du compte, où le nom de famille est
 * facultatif. Refuser la création pour autant fermerait la porte à un
 * utilisateur inscrit sans nom — il ne pourrait plus ni compléter son profil,
 * ni faire son KYC, ni donc corriger quoi que ce soit.
 *
 * Le tiret cadratin est donc écrit sciemment, et nommé ici pour que
 * {@link Identite.estConnue} puisse le reconnaître : c'est un trou déclaré,
 * pas une valeur. Il était auparavant un littéral perdu dans un use case,
 * invisible à quiconque lisait le modèle.
 */
export const MARQUEUR_IDENTITE_INCONNUE = '—';

/** État civil relu depuis le compte — jamais modifié depuis le profil. */
export interface EtatCivilDuCompte {
  prenom: string | null | undefined;
  nom: string | null | undefined;
}

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
  prenom: string;
  nom: string;
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
  prenom: NomPersonne;
  nom: NomPersonne;
  nomNaissance: NomPersonne | null;
  dateNaissance: DateNaissance | null;
  lieuNaissance: Libelle | null;
  paysNaissance: CodePays | null;
  nationalite: CodePays | null;
}

/**
 * État civil du titulaire du profil.
 *
 * Regroupe ce qui répond à « qui est cette personne » : civilité, noms,
 * naissance, nationalité. C'est le bloc que le KYC rapproche de la pièce
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

  /**
   * Première déclaration. L'état civil vient du compte, le reste du
   * formulaire ; à défaut d'état civil, le marqueur plutôt qu'un refus.
   */
  static declarer(
    compte: EtatCivilDuCompte,
    champs: ChampsIdentite = {},
  ): Identite {
    return new Identite({
      prenom: reprendreDuCompte(compte.prenom, 'Le prénom', 'prenom'),
      nom: reprendreDuCompte(compte.nom, 'Le nom', 'nom'),
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
      // Le marqueur est plus court que le minimum exigé : la relecture ne peut
      // pas repasser par la règle, sinon elle refuserait ce qu'elle a écrit.
      prenom: NomPersonne.marqueur(snapshot.prenom),
      nom: NomPersonne.marqueur(snapshot.nom),
      nomNaissance: NomPersonne.restore(snapshot.nomNaissance),
      dateNaissance: DateNaissance.restore(snapshot.dateNaissance),
      lieuNaissance: Libelle.restore(snapshot.lieuNaissance),
      paysNaissance: CodePays.restore(snapshot.paysNaissance),
      nationalite: CodePays.restore(snapshot.nationalite),
    });
  }

  /**
   * Identité révisée. Prénom et nom n'en font pas partie : ils appartiennent au
   * compte, et se changent par le renommage du compte (contexte IAM). Les
   * dupliquer ici ferait diverger deux vérités sur la même personne.
   */
  avec(champs: ChampsIdentite): Identite {
    return new Identite({
      prenom: this.etat.prenom,
      nom: this.etat.nom,
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

  /**
   * L'état civil vient-il réellement du compte, ou n'a-t-on que le marqueur ?
   * Un dossier KYC ne peut pas être instruit sans état civil.
   */
  estConnue(): boolean {
    return (
      this.etat.prenom.value !== MARQUEUR_IDENTITE_INCONNUE &&
      this.etat.nom.value !== MARQUEUR_IDENTITE_INCONNUE
    );
  }

  /** Âge en années révolues, `null` si la date de naissance n'est pas connue. */
  age(): number | null {
    return this.etat.dateNaissance?.age() ?? null;
  }

  get civilite(): string | null {
    return this.etat.civilite;
  }
  get prenom(): string {
    return this.etat.prenom.value;
  }
  get nom(): string {
    return this.etat.nom.value;
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
      this.prenom === other.prenom &&
      this.nom === other.nom &&
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
      prenom: this.prenom,
      nom: this.nom,
      nomNaissance: this.nomNaissance,
      dateNaissance: this.dateNaissance,
      lieuNaissance: this.lieuNaissance,
      paysNaissance: this.paysNaissance,
      nationalite: this.nationalite,
    };
  }
}

/** Nom ou prénom repris du compte, avec repli sur le marqueur. */
function reprendreDuCompte(
  raw: string | null | undefined,
  label: string,
  field: string,
): NomPersonne {
  return (
    NomPersonne.of(raw, label, field) ??
    NomPersonne.marqueur(MARQUEUR_IDENTITE_INCONNUE)
  );
}
