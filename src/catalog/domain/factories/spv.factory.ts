import { RegimeFiscal } from '../enums/regime-fiscal.enum';
import { ChampSpvInvalideError } from '../errors/spv.errors';
import { Spv } from '../aggregates/spv';

/** Ce qu'il faut pour constituer une SPV. Tout le reste est décidé ici. */
export interface CreerSpvProps {
  raisonSociale: string;
  siren?: string | null;
  forme?: string | null;
  capitalSocial?: number | null;
  siegeAdresse?: string | null;
  dateConstitution?: Date | string | null;
  statutsPdfUrl?: string | null;
  regimeFiscal?: RegimeFiscal | null;
  gestionnaireUserId?: number | null;
}

/**
 * Constitution d'une société de projet.
 *
 * Ces choix vivaient dans `ProjectController.createSpv` (§12.5). Ce que la
 * fabrique décide, et qu'aucun appelant ne peut donc contredire :
 *
 * - l'absence d'**IBAN**. Le contrôleur posait `spv.iban = null` alors que le
 *   DTO ne le proposait pas : un compte bancaire ne s'ouvre pas en même temps
 *   qu'une société, et la colonne est `select: false` — c'est une donnée
 *   sensible, renseignée plus tard par un autre chemin ;
 * - le **régime fiscal** par défaut, `IS`, comme le `default` de la colonne ;
 * - la **raison sociale** non vide : c'est le nom légal de la société, et
 *   `@IsNotEmpty()` sur le DTO ne rejetait pas une chaîne d'espaces.
 */
export class SpvFactory {
  static readonly REGIME_FISCAL_PAR_DEFAUT = RegimeFiscal.IS;

  static creer(props: CreerSpvProps): Spv {
    const raisonSociale = props.raisonSociale?.trim();
    if (!raisonSociale) {
      throw new ChampSpvInvalideError('raisonSociale', 'obligatoire.');
    }

    const capitalSocial =
      props.capitalSocial != null ? Number(props.capitalSocial) : null;
    if (
      capitalSocial !== null &&
      (!Number.isFinite(capitalSocial) || capitalSocial < 0)
    ) {
      throw new ChampSpvInvalideError(
        'capitalSocial',
        'attendu positif ou nul.',
      );
    }

    return new Spv({
      // Attribués par la persistance — l'`id` est un uuid généré en base.
      id: undefined as unknown as string,
      createdAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
      raisonSociale,
      siren: videOuNull(props.siren),
      forme: videOuNull(props.forme),
      capitalSocial,
      siegeAdresse: videOuNull(props.siegeAdresse),
      iban: null,
      dateConstitution: dateOuNull(props.dateConstitution),
      statutsPdfUrl: videOuNull(props.statutsPdfUrl),
      regimeFiscal: props.regimeFiscal ?? SpvFactory.REGIME_FISCAL_PAR_DEFAUT,
      gestionnaireUserId: props.gestionnaireUserId ?? null,
    });
  }
}

function videOuNull(valeur: string | null | undefined): string | null {
  const brut = valeur?.trim();
  return brut ? brut : null;
}

function dateOuNull(valeur: Date | string | null | undefined): Date | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(date.getTime())) {
    throw new ChampSpvInvalideError('dateConstitution', 'date illisible.');
  }
  return date;
}
