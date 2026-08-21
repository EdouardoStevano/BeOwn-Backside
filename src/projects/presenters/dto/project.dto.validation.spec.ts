import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateProjectDto } from './project.dto';

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

  it("illustre la faille d'origine : métatypé `Object` (ce que devenait `Partial<>`), le pipe NE valide PAS", async () => {
    const objetMeta: ArgumentMetadata = { type: 'body', metatype: Object, data: '' };
    const payload = { champInconnu: 'injection', triCible: 8 };
    const out = await pipe.transform(payload, objetMeta);
    // Aucune validation, aucun strip : le champ arbitraire passe tel quel.
    expect(out).toEqual(payload);
  });
});
