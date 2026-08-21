import { ChampProfilInvalideError } from 'src/iam/domain/errors';
import { siDeclare } from './champ-declare';
import { FormeJuridique } from './forme-juridique.vo';
import { Libelle } from './libelle.vo';
import { RaisonSociale } from './raison-sociale.vo';
import { Siren } from './siren.vo';

/** Nom de greffe — « Paris », « Nanterre », « Aix-en-Provence ». */
const MAX_VILLE_RCS = 100;

/** Ce que le titulaire déclare de l'identité de sa société. */
export interface ChampsIdentiteLegale {
  raisonSociale?: string | null;
  formeJuridique?: string | null;
  siren?: string | null;
  rcsVille?: string | null;
}

export interface IdentiteLegaleSnapshot {
  raisonSociale: string;
  formeJuridique: string | null;
  siren: string | null;
  rcsVille: string | null;
}

interface EtatIdentiteLegale {
  raisonSociale: RaisonSociale;
  formeJuridique: FormeJuridique | null;
  siren: Siren | null;
  rcsVille: Libelle | null;
}

/**
 * Identité légale de la personne morale : comment elle s'appelle, sous quelle
 * forme, et sous quel numéro elle est immatriculée.
 *
 * Ces quatre champs tiennent ensemble parce qu'ils décrivent une seule chose —
 * **l'inscription au registre du commerce** — et surtout parce qu'ils portent
 * un invariant commun : un greffe (`rcsVille`) sans SIREN ne désigne aucune
 * immatriculation. Aucun Value Object atomique ne peut trancher seul ; la
 * règle est donc ici, comme celle du code postal l'est dans `Coordonnees`.
 *
 * Les autres champs du profil moral — capital, siège, secteur, représentant —
 * restent à plat sur l'agrégat. Ce sont des valeurs indépendantes, sans règle
 * qui les lie deux à deux : les regrouper produirait un sac nommé d'après rien.
 * Un bloc se justifie par un invariant partagé, pas par le besoin de faire des
 * paquets.
 *
 * **Immuable** : {@link avec} rend une nouvelle identité plutôt que de modifier
 * celle-ci. L'agrégat remplace donc sa référence, et comparer l'avant et
 * l'après pour savoir si quelque chose a bougé devient une simple égalité de
 * valeurs.
 */
export class IdentiteLegale {
  private constructor(private readonly etat: EtatIdentiteLegale) {}

  static declarer(champs: ChampsIdentiteLegale = {}): IdentiteLegale {
    return new IdentiteLegale(
      verifierCoherence({
        raisonSociale: RaisonSociale.of(champs.raisonSociale),
        formeJuridique: FormeJuridique.of(champs.formeJuridique),
        siren: Siren.of(champs.siren),
        rcsVille: Libelle.of(
          champs.rcsVille,
          'La ville du RCS',
          'rcsVille',
          MAX_VILLE_RCS,
        ),
      }),
    );
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `Siren`). */
  static restore(snapshot: IdentiteLegaleSnapshot): IdentiteLegale {
    return new IdentiteLegale({
      raisonSociale: RaisonSociale.restore(snapshot.raisonSociale),
      formeJuridique: FormeJuridique.restore(snapshot.formeJuridique),
      siren: Siren.restore(snapshot.siren),
      rcsVille: Libelle.restore(snapshot.rcsVille),
    });
  }

  /**
   * Identité révisée.
   *
   * La cohérence est rejouée sur l'état **complet**, pas sur les seuls champs
   * fournis : effacer le seul SIREN laisserait une ville de RCS orpheline,
   * alors même que la requête ne parlait pas du greffe.
   *
   * La raison sociale ne peut pas être effacée — `RaisonSociale.of` refuse le
   * vide. C'est voulu : la colonne est NOT NULL, et une société sans
   * dénomination ne désigne personne. La déclarer à nouveau, en revanche, est
   * permis.
   */
  avec(champs: ChampsIdentiteLegale): IdentiteLegale {
    return new IdentiteLegale(
      verifierCoherence({
        raisonSociale: siDeclare(
          champs.raisonSociale,
          (v) => RaisonSociale.of(v),
          this.etat.raisonSociale,
        ),
        formeJuridique: siDeclare(
          champs.formeJuridique,
          (v) => FormeJuridique.of(v),
          this.etat.formeJuridique,
        ),
        siren: siDeclare(champs.siren, (v) => Siren.of(v), this.etat.siren),
        rcsVille: siDeclare(
          champs.rcsVille,
          (v) => Libelle.of(v, 'La ville du RCS', 'rcsVille', MAX_VILLE_RCS),
          this.etat.rcsVille,
        ),
      }),
    );
  }

  /**
   * La société est-elle immatriculée ? Le SIREN en est la seule preuve dans ce
   * modèle — une raison sociale se déclare, un numéro s'attribue.
   */
  estImmatriculee(): boolean {
    return this.etat.siren !== null;
  }

  get raisonSociale(): string {
    return this.etat.raisonSociale.value;
  }
  get formeJuridique(): string | null {
    return this.etat.formeJuridique?.value ?? null;
  }
  get siren(): string | null {
    return this.etat.siren?.value ?? null;
  }
  get rcsVille(): string | null {
    return this.etat.rcsVille?.value ?? null;
  }

  /** Égalité par valeur — un VO n'a pas d'identité. */
  equals(other: IdentiteLegale): boolean {
    return (
      this.raisonSociale === other.raisonSociale &&
      this.formeJuridique === other.formeJuridique &&
      this.siren === other.siren &&
      this.rcsVille === other.rcsVille
    );
  }

  toSnapshot(): IdentiteLegaleSnapshot {
    return {
      raisonSociale: this.raisonSociale,
      formeJuridique: this.formeJuridique,
      siren: this.siren,
      rcsVille: this.rcsVille,
    };
  }
}

/** Rend l'état inchangé s'il est cohérent, lève sinon. */
function verifierCoherence(etat: EtatIdentiteLegale): EtatIdentiteLegale {
  // Le greffe est celui auprès duquel le SIREN est inscrit : l'annoncer sans
  // numéro laisse une immatriculation à moitié déclarée, que ni le DBE-S1 ni
  // une vérification au registre ne sauront exploiter.
  if (etat.rcsVille && !etat.siren) {
    throw new ChampProfilInvalideError(
      'Le SIREN',
      "est requis dès lors qu'une ville du RCS est déclarée : c'est le greffe auprès duquel ce numéro est inscrit.",
      'siren',
    );
  }
  return etat;
}
