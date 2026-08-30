import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import {
  ProjectInstrument,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';

/**
 * Non-régression du correctif L-4 : `PATCH /projects/:id` typait son body
 * `Partial<CreateProjectDto>` — un type effacé en `Object` au runtime, que le
 * `ValidationPipe` (whitelist + forbidNonWhitelisted) ne valide PAS → des
 * champs arbitraires atteignaient le use case.
 *
 * Ces tests exécutent le pipe avec EXACTEMENT la configuration de `main.ts` et
 * prouvent que, métatypé sur la vraie classe `UpdateProjectDto` (PartialType),
 * la whitelist est bien réactivée.
 */
describe('UpdateProjectDto — validation du PATCH projet (L-4)', () => {
  // Config identique à app.useGlobalPipes(...) dans main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const meta: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateProjectDto,
    data: '',
  };

  it('accepte une mise à jour partielle valide (champs absents ignorés)', async () => {
    const out = await pipe.transform({ triCible: 12.5 }, meta);
    expect(out).toBeInstanceOf(UpdateProjectDto);
    expect(out.triCible).toBe(12.5);
  });

  it('accepte un body vide (tous les champs sont optionnels)', async () => {
    const out = await pipe.transform({}, meta);
    expect(out).toBeInstanceOf(UpdateProjectDto);
  });

  it('REJETTE un champ inconnu (whitelist réactivée — cœur du correctif L-4)', async () => {
    await expect(
      pipe.transform({ triCible: 8, champInconnu: 'injection' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJETTE une valeur non conforme (capitalCible négatif viole @IsPositive)', async () => {
    await expect(
      pipe.transform({ capitalCible: -5 } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJETTE un capitalCible au-dessus du plafond PSFP (@Max 5 000 000)', async () => {
    await expect(
      pipe.transform({ capitalCible: 6_000_000 } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ACCEPTE `modeleEconomique: "equity"` (le champ n\'était exposé par aucun DTO : il produisait un 400)', async () => {
    const out = await pipe.transform({ modeleEconomique: 'equity' } as any, meta);
    expect(out.modeleEconomique).toBe(ModeleEconomique.EQUITY);
  });

  it('ACCEPTE `modeleEconomique: "obligataire"`', async () => {
    const out = await pipe.transform(
      { modeleEconomique: 'obligataire' } as any,
      meta,
    );
    expect(out.modeleEconomique).toBe(ModeleEconomique.OBLIGATAIRE);
  });

  it('REJETTE une valeur de modèle inconnue', async () => {
    await expect(
      pipe.transform({ modeleEconomique: 'immobilier' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("laisse `modeleEconomique` absent quand il n'est pas fourni (le use case appliquera obligataire)", async () => {
    const out = await pipe.transform({ triCible: 8 }, meta);
    expect(out.modeleEconomique).toBeUndefined();
  });

  it("illustre la faille d'origine : métatypé `Object` (ce que devenait `Partial<>`), le pipe NE valide PAS", async () => {
    const objetMeta: ArgumentMetadata = { type: 'body', metatype: Object, data: '' };
    const payload = { champInconnu: 'injection', triCible: 8 };
    const out = await pipe.transform(payload, objetMeta);
    // Aucune validation, aucun strip : le champ arbitraire passe tel quel.
    expect(out).toEqual(payload);
  });
});

/**
 * Le commutateur de modèle économique doit être écrivable à la CRÉATION.
 * Auparavant, `modeleEconomique` n'était porté par aucun DTO : avec le
 * `ValidationPipe` global en `whitelist + forbidNonWhitelisted`, l'envoyer
 * produisait un 400 et le champ n'atteignait jamais le use case — tout projet
 * était donc obligataire, et la chaîne equity structurellement inatteignable.
 */
describe('CreateProjectDto — commutateur `modeleEconomique`', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const meta: ArgumentMetadata = {
    type: 'body',
    metatype: CreateProjectDto,
    data: '',
  };

  /** Corps minimal valide : tous les champs requis, aucun champ optionnel. */
  const corpsMinimal = () => ({
    titre: 'Résidence Test',
    type: ProjectType.RESIDENTIEL,
    capitalCible: 500_000,
    capitalMinimum: 300_000,
    dureeMois: 24,
    instrument: ProjectInstrument.PART_SOCIALE,
  });

  it('ACCEPTE `equity` (ne produit plus de 400)', async () => {
    const out = await pipe.transform(
      { ...corpsMinimal(), modeleEconomique: 'equity' } as any,
      meta,
    );
    expect(out).toBeInstanceOf(CreateProjectDto);
    expect(out.modeleEconomique).toBe(ModeleEconomique.EQUITY);
  });

  it('ACCEPTE `obligataire`', async () => {
    const out = await pipe.transform(
      { ...corpsMinimal(), modeleEconomique: 'obligataire' } as any,
      meta,
    );
    expect(out.modeleEconomique).toBe(ModeleEconomique.OBLIGATAIRE);
  });

  it('reste optionnel : un corps sans le champ passe la validation', async () => {
    const out = await pipe.transform(corpsMinimal() as any, meta);
    expect(out).toBeInstanceOf(CreateProjectDto);
    expect(out.modeleEconomique).toBeUndefined();
  });

  it('REJETTE une valeur hors énumération', async () => {
    await expect(
      pipe.transform(
        { ...corpsMinimal(), modeleEconomique: 'EQUITY_LOCATIVE' } as any,
        meta,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
