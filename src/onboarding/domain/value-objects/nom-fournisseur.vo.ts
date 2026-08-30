import { ChampKycInvalideError } from 'src/onboarding/domain/errors';

/** Longueur retenue pour un nom de prestataire — ce sont des identifiants courts. */
const MAX_LONGUEUR = 50;

/**
 * Nom du prestataire de vérification d'identité rattaché au dossier
 * (`stripeIdentity` aujourd'hui).
 *
 * La colonne est `NOT NULL` : une chaîne vide y passerait sans bruit et rendrait
 * le dossier impossible à rattacher à un prestataire — donc à relancer.
 *
 * Ce contrôle empruntait le `Libelle` de Profiles, un VO générique de texte
 * libre paramétré par une longueur maximale, écrit pour les villes, professions
 * et lignes d'adresse. Le KYC n'en avait besoin que pour ce seul champ : le
 * réduire à sa règle utile évite de faire dépendre ce contexte de tout le
 * vocabulaire des profils (§5 — CRP).
 */
export class NomFournisseur {
  private constructor(readonly value: string) {}

  static of(raw: string): NomFournisseur {
    if (typeof raw !== 'string') {
      throw new ChampKycInvalideError(
        'Le fournisseur de vérification',
        'est invalide.',
        'fournisseur',
      );
    }

    const normalise = raw.trim().replace(/\s+/g, ' ');
    if (normalise.length === 0) {
      throw new ChampKycInvalideError(
        'Le fournisseur de vérification',
        'est obligatoire.',
        'fournisseur',
      );
    }
    if (normalise.length > MAX_LONGUEUR) {
      throw new ChampKycInvalideError(
        'Le fournisseur de vérification',
        `ne peut pas dépasser ${MAX_LONGUEUR} caractères.`,
        'fournisseur',
      );
    }
    if (contientUnCaractereDeControle(normalise)) {
      throw new ChampKycInvalideError(
        'Le fournisseur de vérification',
        'contient des caractères non imprimables.',
        'fournisseur',
      );
    }

    return new NomFournisseur(normalise);
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Caractères de contrôle. Tabulations et sauts de ligne ont déjà été réduits à
 * l'espace par la normalisation ; ce qui reste n'apparaît jamais dans une
 * saisie légitime et signale un copier-coller douteux, ou une tentative
 * d'injection dans un export CSV ou un PDF réglementaire.
 */
function contientUnCaractereDeControle(texte: string): boolean {
  return [...texte].some((caractere) => {
    const code = caractere.codePointAt(0) as number;
    // C0 (0x00-0x1F), DEL (0x7F) et C1 (0x80-0x9F).
    return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
  });
}
