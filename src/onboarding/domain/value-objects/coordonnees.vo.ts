import { ChampProfilInvalideError } from 'src/onboarding/domain/errors';
import { siDeclare } from './champ-declare';
import { CodePays } from './code-pays.vo';
import { CodePostal } from './code-postal.vo';
import { Libelle } from './libelle.vo';
import { NumeroTelephone } from './numero-telephone.vo';

const MAX_ADRESSE = 200;
const MAX_VILLE = 100;

/** L'adresse postale que le titulaire déclare. */
export interface ChampsCoordonnees {
  telephone?: string | null;
  adresseLigne1?: string | null;
  adresseLigne2?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  pays?: string | null;
}

export interface CoordonneesSnapshot {
  telephone: string | null;
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
}

interface EtatCoordonnees {
  telephone: NumeroTelephone | null;
  adresseLigne1: Libelle | null;
  adresseLigne2: Libelle | null;
  codePostal: CodePostal | null;
  ville: Libelle | null;
  pays: CodePays | null;
}

/**
 * Comment joindre le titulaire : son adresse postale et son téléphone.
 *
 * Les deux vont ensemble, et le nom du bloc le dit. Le téléphone a fait un
 * détour par le compte, au motif qu'un numéro joint une personne et non un
 * dossier ; il revient ici, où il est ce qu'il est vraiment — une coordonnée
 * déclarée, du même ordre que l'adresse, et le canal de rappel obligatoire du
 * conseil PSFP.
 *
 * L'adresse tient par un invariant précis : **un code postal n'a de sens que
 * rapporté à son pays**. « 1000 » est
 * un code belge parfaitement valide et un code français parfaitement faux ;
 * aucun des deux Value Objects atomiques ne peut trancher seul, et la règle
 * flottait donc au niveau de l'agrégat, où elle voisinait avec des sujets sans
 * rapport. Elle est ici chez elle. Le téléphone, lui, ne dépend d'aucun autre
 * champ : il se valide seul.
 *
 * **Immuable** — cf. `Identite`.
 */
export class Coordonnees {
  private constructor(private readonly etat: EtatCoordonnees) {}

  static declarer(champs: ChampsCoordonnees = {}): Coordonnees {
    return new Coordonnees(
      verifierCoherence({
        telephone: NumeroTelephone.of(champs.telephone),
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
      }),
    );
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: CoordonneesSnapshot): Coordonnees {
    return new Coordonnees({
      telephone: NumeroTelephone.restore(snapshot.telephone),
      adresseLigne1: Libelle.restore(snapshot.adresseLigne1),
      adresseLigne2: Libelle.restore(snapshot.adresseLigne2),
      codePostal: CodePostal.restore(snapshot.codePostal),
      ville: Libelle.restore(snapshot.ville),
      pays: CodePays.restore(snapshot.pays),
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
        telephone: siDeclare(
          champs.telephone,
          (v) => NumeroTelephone.of(v),
          this.etat.telephone,
        ),
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

  get telephone(): string | null {
    return this.etat.telephone?.value ?? null;
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

  equals(other: Coordonnees): boolean {
    return (
      this.telephone === other.telephone &&
      this.adresseLigne1 === other.adresseLigne1 &&
      this.adresseLigne2 === other.adresseLigne2 &&
      this.codePostal === other.codePostal &&
      this.ville === other.ville &&
      this.pays === other.pays
    );
  }

  toSnapshot(): CoordonneesSnapshot {
    return {
      telephone: this.telephone,
      adresseLigne1: this.adresseLigne1,
      adresseLigne2: this.adresseLigne2,
      codePostal: this.codePostal,
      ville: this.ville,
      pays: this.pays,
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
