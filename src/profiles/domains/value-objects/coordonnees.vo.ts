import { ChampProfilInvalideError } from 'src/profiles/domains/errors';
import { siDeclare } from './champ-declare';
import { CodePays } from './code-pays.vo';
import { CodePostal } from './code-postal.vo';
import { Libelle } from './libelle.vo';
import { NumeroTelephone } from './numero-telephone.vo';

const MAX_ADRESSE = 200;
const MAX_VILLE = 100;

/** Ce que le titulaire déclare pour qu'on puisse le joindre. */
export interface ChampsCoordonnees {
  adresseLigne1?: string | null;
  adresseLigne2?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  pays?: string | null;
  telephone?: string | null;
}

export interface CoordonneesSnapshot {
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
}

interface EtatCoordonnees {
  adresseLigne1: Libelle | null;
  adresseLigne2: Libelle | null;
  codePostal: CodePostal | null;
  ville: Libelle | null;
  pays: CodePays | null;
  telephone: NumeroTelephone | null;
}

/**
 * Coordonnées du titulaire : adresse postale et téléphone.
 *
 * Elles tiennent ensemble parce qu'elles répondent à la même question — « où
 * joindre cette personne » — et surtout parce qu'elles portent un invariant
 * commun : **un code postal n'a de sens que rapporté à son pays**. « 1000 » est
 * un code belge parfaitement valide et un code français parfaitement faux ;
 * aucun des deux Value Objects atomiques ne peut trancher seul, et la règle
 * flottait donc au niveau de l'agrégat, où elle voisinait avec des sujets sans
 * rapport. Elle est ici chez elle.
 *
 * **Immuable** — cf. `Identite`.
 */
export class Coordonnees {
  private constructor(private readonly etat: EtatCoordonnees) {}

  static declarer(champs: ChampsCoordonnees = {}): Coordonnees {
    return new Coordonnees(
      verifierCoherence({
        adresseLigne1: Libelle.of(
          champs.adresseLigne1,
          "La première ligne d'adresse",
          'adresseLigne1',
          MAX_ADRESSE,
        ),
        adresseLigne2: Libelle.of(
          champs.adresseLigne2,
          "La seconde ligne d'adresse",
          'adresseLigne2',
          MAX_ADRESSE,
        ),
        codePostal: CodePostal.of(champs.codePostal),
        ville: Libelle.of(champs.ville, 'La ville', 'ville', MAX_VILLE),
        pays: CodePays.of(champs.pays, 'Le pays de résidence', 'pays'),
        telephone: NumeroTelephone.of(champs.telephone),
      }),
    );
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: CoordonneesSnapshot): Coordonnees {
    return new Coordonnees({
      adresseLigne1: Libelle.restore(snapshot.adresseLigne1),
      adresseLigne2: Libelle.restore(snapshot.adresseLigne2),
      codePostal: CodePostal.restore(snapshot.codePostal),
      ville: Libelle.restore(snapshot.ville),
      pays: CodePays.restore(snapshot.pays),
      telephone: NumeroTelephone.restore(snapshot.telephone),
    });
  }

  /**
   * Coordonnées révisées.
   *
   * La cohérence est rejouée sur l'état **complet**, pas sur les seuls champs
   * fournis : déménager de Belgique en France ne touche que `pays`, et rend
   * pourtant invalide le code postal enregistré la semaine précédente.
   */
  avec(champs: ChampsCoordonnees): Coordonnees {
    return new Coordonnees(
      verifierCoherence({
        adresseLigne1: siDeclare(
          champs.adresseLigne1,
          (v) =>
            Libelle.of(
              v,
              "La première ligne d'adresse",
              'adresseLigne1',
              MAX_ADRESSE,
            ),
          this.etat.adresseLigne1,
        ),
        adresseLigne2: siDeclare(
          champs.adresseLigne2,
          (v) =>
            Libelle.of(
              v,
              "La seconde ligne d'adresse",
              'adresseLigne2',
              MAX_ADRESSE,
            ),
          this.etat.adresseLigne2,
        ),
        codePostal: siDeclare(
          champs.codePostal,
          (v) => CodePostal.of(v),
          this.etat.codePostal,
        ),
        ville: siDeclare(
          champs.ville,
          (v) => Libelle.of(v, 'La ville', 'ville', MAX_VILLE),
          this.etat.ville,
        ),
        pays: siDeclare(
          champs.pays,
          (v) => CodePays.of(v, 'Le pays de résidence', 'pays'),
          this.etat.pays,
        ),
        telephone: siDeclare(
          champs.telephone,
          (v) => NumeroTelephone.of(v),
          this.etat.telephone,
        ),
      }),
    );
  }

  /**
   * Une adresse postale a-t-elle été donnée ? La première ligne suffit à en
   * juger : c'est la seule sans laquelle le reste ne mène nulle part.
   */
  estRenseignee(): boolean {
    return this.etat.adresseLigne1 !== null;
  }

  get adresseLigne1(): string | null {
    return this.etat.adresseLigne1?.value ?? null;
  }
  get adresseLigne2(): string | null {
    return this.etat.adresseLigne2?.value ?? null;
  }
  get codePostal(): string | null {
    return this.etat.codePostal?.value ?? null;
  }
  get ville(): string | null {
    return this.etat.ville?.value ?? null;
  }
  get pays(): string | null {
    return this.etat.pays?.value ?? null;
  }
  get telephone(): string | null {
    return this.etat.telephone?.value ?? null;
  }

  equals(other: Coordonnees): boolean {
    return (
      this.adresseLigne1 === other.adresseLigne1 &&
      this.adresseLigne2 === other.adresseLigne2 &&
      this.codePostal === other.codePostal &&
      this.ville === other.ville &&
      this.pays === other.pays &&
      this.telephone === other.telephone
    );
  }

  toSnapshot(): CoordonneesSnapshot {
    return {
      adresseLigne1: this.adresseLigne1,
      adresseLigne2: this.adresseLigne2,
      codePostal: this.codePostal,
      ville: this.ville,
      pays: this.pays,
      telephone: this.telephone,
    };
  }
}

/** Rend l'état inchangé s'il est cohérent, lève sinon. */
function verifierCoherence(etat: EtatCoordonnees): EtatCoordonnees {
  if (
    etat.codePostal &&
    etat.pays &&
    !etat.codePostal.estConformeA(etat.pays)
  ) {
    const attendu = CodePostal.formatAttendu(etat.pays);
    throw new ChampProfilInvalideError(
      'Le code postal',
      `ne correspond pas au format du pays ${etat.pays.value}${
        attendu ? ` (attendu : ${attendu})` : ''
      }.`,
      'codePostal',
    );
  }
  return etat;
}
