import { ChampProfilInvalideError } from 'src/profiles/domains/errors';
import { plafondConseillePour } from 'src/profiles/domains/services/plafond-psfp.domain-service';

/** Étape 3 du questionnaire, telle que le formulaire l'envoie. */
export interface ChampsCapaciteDePerte {
  patrimoineNet?: number | string | null;
  revenuAnnuel?: number | string | null;
  budgetAnnuelInvestissement?: number | string | null;
  acceptsSimulatedLoss?: boolean;
}

export interface CapaciteDePerteSnapshot {
  patrimoineNet: number | null;
  revenuAnnuel: number | null;
  budgetAnnuelInvestissement: number | null;
  acceptsSimulatedLoss: boolean;
}

/** Les colonnes `decimal` reviennent en chaîne du driver Postgres. */
export interface CapaciteDePerteSnapshotBrut extends Omit<
  CapaciteDePerteSnapshot,
  'patrimoineNet' | 'revenuAnnuel' | 'budgetAnnuelInvestissement'
> {
  patrimoineNet: number | string | null;
  revenuAnnuel: number | string | null;
  budgetAnnuelInvestissement: number | string | null;
}

/** Au-delà, c'est une faute de frappe : aucun patrimoine déclaré ici n'atteint mille milliards. */
const MONTANT_MAXIMUM = 1_000_000_000_000;

/**
 * Étape 3 — capacité de perte : patrimoine, revenus, budget d'investissement,
 * et la simulation de perte totale que le titulaire déclare accepter.
 *
 * Ces quatre données forment un bloc parce qu'elles répondent toutes à la même
 * question réglementaire — « que peut-il perdre sans dommage ? » — et parce que
 * c'est ensemble qu'elles fondent le {@link plafondConseille}. L'acceptation de
 * la perte simulée y est comprise plutôt que laissée à plat : elle ne veut rien
 * dire sans les montants sur lesquels la simulation a porté.
 *
 * **Immuable.** Les montants sont éprouvés ici — au titre de l'étape à laquelle
 * ils appartiennent — parce qu'un patrimoine négatif produirait un plafond
 * conseillé négatif, donc un plancher réglementaire appliqué à tout le monde,
 * et qu'un `NaN` se propagerait jusqu'au contrôle de souscription.
 */
export class CapaciteDePerte {
  private constructor(private readonly etat: CapaciteDePerteSnapshot) {}

  static declarer(champs: ChampsCapaciteDePerte = {}): CapaciteDePerte {
    return new CapaciteDePerte({
      patrimoineNet: eprouverMontant(
        champs.patrimoineNet,
        'Le patrimoine net',
        'patrimoineNet',
      ),
      revenuAnnuel: eprouverMontant(
        champs.revenuAnnuel,
        'Le revenu annuel',
        'revenuAnnuel',
      ),
      budgetAnnuelInvestissement: eprouverMontant(
        champs.budgetAnnuelInvestissement,
        "Le budget annuel d'investissement",
        'budgetAnnuelInvestissement',
      ),
      acceptsSimulatedLoss: champs.acceptsSimulatedLoss === true,
    });
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`) — mais
   * en absorbant les chaînes que le driver rend pour une colonne `decimal`.
   */
  static restore(snapshot: CapaciteDePerteSnapshotBrut): CapaciteDePerte {
    return new CapaciteDePerte({
      patrimoineNet: nombreOuNull(snapshot.patrimoineNet),
      revenuAnnuel: nombreOuNull(snapshot.revenuAnnuel),
      budgetAnnuelInvestissement: nombreOuNull(
        snapshot.budgetAnnuelInvestissement,
      ),
      acceptsSimulatedLoss: snapshot.acceptsSimulatedLoss === true,
    });
  }

  /**
   * Montant conseillé par investissement, pour qui n'est ni averti ni
   * professionnel.
   *
   * Le calcul est celui du profil, à la virgule près : les deux passent par
   * `plafondConseillePour`. Savoir **si** ce plafond s'applique n'appartient pas
   * à ce bloc mais au classement — voir `ResultatAdequation`.
   */
  plafondConseille(): number {
    return plafondConseillePour(this.etat.patrimoineNet);
  }

  get patrimoineNet(): number | null {
    return this.etat.patrimoineNet;
  }
  get revenuAnnuel(): number | null {
    return this.etat.revenuAnnuel;
  }
  get budgetAnnuelInvestissement(): number | null {
    return this.etat.budgetAnnuelInvestissement;
  }
  get acceptsSimulatedLoss(): boolean {
    return this.etat.acceptsSimulatedLoss;
  }

  toSnapshot(): CapaciteDePerteSnapshot {
    return { ...this.etat };
  }
}

/**
 * Le DTO borne déjà ces montants (`@IsNumber` + `@Min(0)`), mais il ne couvre
 * que la route HTTP : un import, un script de reprise ou un futur appelant
 * interne n'y passent pas. La borne vit ici pour valoir partout.
 */
function eprouverMontant(
  raw: number | string | null | undefined,
  label: string,
  field: string,
): number | null {
  if (raw === null || raw === undefined || raw === '') return null;

  const montant = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(montant)) {
    throw new ChampProfilInvalideError(label, 'doit être un nombre.', field);
  }
  if (montant < 0) {
    throw new ChampProfilInvalideError(
      label,
      'ne peut pas être négatif.',
      field,
    );
  }
  if (montant > MONTANT_MAXIMUM) {
    throw new ChampProfilInvalideError(
      label,
      'dépasse les montants attendus — vérifiez la saisie.',
      field,
    );
  }
  return montant;
}

/**
 * À la relecture, une chaîne illisible vaut « non renseigné » plutôt qu'un
 * `NaN` qui se propagerait jusqu'au plafond (cf. `EvaluationInvestisseur`).
 */
function nombreOuNull(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const valeur = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(valeur) ? valeur : null;
}
