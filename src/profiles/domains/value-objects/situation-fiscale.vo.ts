import { ChampProfilInvalideError } from 'src/profiles/domains/errors';
import { siDeclare } from './champ-declare';
import { CodePays } from './code-pays.vo';
import { NumeroFiscal } from './numero-fiscal.vo';

/** Ce que le titulaire déclare au titre de l'échange d'informations fiscales. */
export interface ChampsSituationFiscale {
  residenceFiscale?: string | null;
  nif?: string | null;
}

export interface SituationFiscaleSnapshot {
  residenceFiscale: string | null;
  nif: string | null;
}

interface EtatSituationFiscale {
  residenceFiscale: CodePays | null;
  nif: NumeroFiscal | null;
}

/**
 * Situation fiscale déclarée : juridiction de résidence et numéro
 * d'identification qui s'y rattache.
 *
 * Les deux champs ne se séparent pas : un NIF est délivré **par un État**, et
 * sans savoir lequel il n'identifie personne — l'échange automatique
 * d'informations (CRS / DAC2) partirait avec une juridiction vide, ce qui est
 * précisément le cas que le dispositif cherche à empêcher. C'est cet invariant
 * partagé qui fait de ces deux champs un bloc plutôt que deux voisins.
 *
 * **Immuable** — cf. `Identite`.
 */
export class SituationFiscale {
  private constructor(private readonly etat: EtatSituationFiscale) {}

  static declarer(champs: ChampsSituationFiscale = {}): SituationFiscale {
    return new SituationFiscale(
      verifierCoherence({
        residenceFiscale: CodePays.of(
          champs.residenceFiscale,
          'La résidence fiscale',
          'residenceFiscale',
        ),
        nif: NumeroFiscal.of(champs.nif),
      }),
    );
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: SituationFiscaleSnapshot): SituationFiscale {
    return new SituationFiscale({
      residenceFiscale: CodePays.restore(snapshot.residenceFiscale),
      nif: NumeroFiscal.restore(snapshot.nif),
    });
  }

  /**
   * Situation révisée. La cohérence est rejouée sur l'état complet : effacer la
   * seule résidence fiscale laisserait un NIF orphelin.
   */
  avec(champs: ChampsSituationFiscale): SituationFiscale {
    return new SituationFiscale(
      verifierCoherence({
        residenceFiscale: siDeclare(
          champs.residenceFiscale,
          (v) => CodePays.of(v, 'La résidence fiscale', 'residenceFiscale'),
          this.etat.residenceFiscale,
        ),
        nif: siDeclare(champs.nif, (v) => NumeroFiscal.of(v), this.etat.nif),
      }),
    );
  }

  get residenceFiscale(): string | null {
    return this.etat.residenceFiscale?.value ?? null;
  }
  get nif(): string | null {
    return this.etat.nif?.value ?? null;
  }

  equals(other: SituationFiscale): boolean {
    return (
      this.residenceFiscale === other.residenceFiscale && this.nif === other.nif
    );
  }

  toSnapshot(): SituationFiscaleSnapshot {
    return { residenceFiscale: this.residenceFiscale, nif: this.nif };
  }
}

/** Rend l'état inchangé s'il est cohérent, lève sinon. */
function verifierCoherence(etat: EtatSituationFiscale): EtatSituationFiscale {
  if (etat.nif && !etat.residenceFiscale) {
    throw new ChampProfilInvalideError(
      "Le numéro d'identification fiscale",
      'ne peut pas être déclaré sans indiquer la résidence fiscale correspondante.',
      'residenceFiscale',
    );
  }
  return etat;
}
