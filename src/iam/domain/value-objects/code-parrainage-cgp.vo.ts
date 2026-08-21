import { CodeParrainageMalFormeError } from 'src/iam/domain/errors/cgp.errors';

/** Longueur de la partie aléatoire, en caractères hexadécimaux. */
const LONGUEUR_ALEA = 8;

const FORMAT = /^CGP-[0-9A-F]{8}$/;

/**
 * Code de parrainage d'un conseiller en gestion de patrimoine.
 *
 * Un investisseur s'y rattache en le saisissant : c'est donc un identifiant
 * public, qui circule par email ou de vive voix, et qui doit rester lisible et
 * dictable — d'où l'hexadécimal en capitales plutôt qu'un UUID.
 *
 * La forme était produite en une ligne dans le contrôleur
 * (`` `CGP-${randomBytes(4).toString('hex').toUpperCase()}` ``) et n'était
 * éprouvée nulle part : `PATCH /cgp/join/:referralCode` acceptait n'importe
 * quelle chaîne et allait la chercher en base. Un code mal formé ne peut plus
 * atteindre le repository.
 *
 * L'aléa vient de l'appelant ({@link depuisAlea}) : le domaine dit à quoi
 * ressemble un code, pas où trouver de l'entropie.
 */
export class CodeParrainageCgp {
  private constructor(readonly valeur: string) {}

  /** Éprouve un code reçu de l'extérieur — saisie, base, import. */
  static of(raw: string): CodeParrainageCgp {
    const valeur = raw.trim().toUpperCase();
    if (!FORMAT.test(valeur)) {
      throw new CodeParrainageMalFormeError(raw);
    }
    return new CodeParrainageCgp(valeur);
  }

  /**
   * Reconstitution depuis la persistance, sans validation — une valeur écrite
   * avant que la règle n'existe doit rester lisible, comme pour les noms et les
   * adresses (voir `UserMapper.restore`).
   */
  static restore(valeur: string | null): CodeParrainageCgp | null {
    return valeur === null ? null : new CodeParrainageCgp(valeur);
  }

  /**
   * Compose un code à partir d'une source d'entropie.
   *
   * @param hex chaîne hexadécimale d'au moins {@link LONGUEUR_ALEA} caractères.
   */
  static depuisAlea(hex: string): CodeParrainageCgp {
    return CodeParrainageCgp.of(
      `CGP-${hex.slice(0, LONGUEUR_ALEA).toUpperCase()}`,
    );
  }

  estEgalA(autre: CodeParrainageCgp | null): boolean {
    return autre !== null && autre.valeur === this.valeur;
  }

  toString(): string {
    return this.valeur;
  }
}
