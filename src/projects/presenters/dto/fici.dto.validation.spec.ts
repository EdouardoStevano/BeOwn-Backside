import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import {
  FiciDto,
  LONGUEUR_MAX_SECTION,
  LONGUEUR_MIN_SECTION,
} from './fici.dto';
import { SECTIONS_REQUISES, SectionFici } from 'src/projects/domains/fici';

/**
 * Le pipe est instancié avec EXACTEMENT la configuration de `main.ts`
 * (whitelist + forbidNonWhitelisted + transform), pour que ces tests décrivent
 * le comportement réel de l'endpoint et pas celui d'un pipe de laboratoire.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const meta: ArgumentMetadata = { type: 'body', metatype: FiciDto, data: '' };

const sectionsCompletes = () =>
  Object.fromEntries(
    SECTIONS_REQUISES.map((section) => [
      section,
      'Contenu rédigé par le porteur, suffisamment long pour être accepté.',
    ]),
  ) as Record<SectionFici, string>;

const messageDe = async (body: unknown): Promise<string> => {
  try {
    await pipe.transform(body, meta);
    throw new Error('le pipe aurait dû rejeter ce corps');
  } catch (e) {
    if (!(e instanceof BadRequestException)) throw e;
    return JSON.stringify((e.getResponse() as any).message);
  }
};

describe('FiciDto — validation du corps de PUT /admin/projets/:id/document-cles', () => {
  it('accepte un document complet', async () => {
    const out = await pipe.transform(
      { sections: sectionsCompletes(), nombrePages: 5, langue: 'fr' },
      meta,
    );
    expect(out).toBeInstanceOf(FiciDto);
    expect(Object.keys(out.sections)).toHaveLength(8);
  });

  it('accepte un document partiel : la complétude est jugée par le domaine, pas par le DTO', async () => {
    const out = await pipe.transform(
      {
        sections: { [SectionFici.FRAIS]: '7 % des loyers encaissés au réel.' },
      },
      meta,
    );
    expect(out.sections[SectionFici.FRAIS]).toBeDefined();
  });

  it('refuse un corps sans sections', async () => {
    expect(await messageDe({ nombrePages: 3 })).toContain(
      'sections est requis',
    );
  });

  it('refuse une clé de section inconnue — y compris une ancienne clé', async () => {
    const message = await messageDe({
      sections: { offre_de_titres: 'ancienne section, disparue du gabarit' },
    });
    expect(message).toContain('Section inconnue « offre_de_titres »');
  });

  it('refuse une section trop courte, en la nommant par son intitulé', async () => {
    const message = await messageDe({
      sections: { [SectionFici.FRAIS]: 'trop court' },
    });
    expect(message).toContain('« 7 — Frais »');
    expect(message).toContain(`${LONGUEUR_MIN_SECTION} au minimum`);
  });

  it('refuse une section vide', async () => {
    const message = await messageDe({
      sections: { [SectionFici.SOCIETE_SUPPORT]: '   ' },
    });
    expect(message).toContain(
      '« 3 — La société support et vos parts » est vide',
    );
  });

  it('refuse une section au-delà de la borne haute', async () => {
    const message = await messageDe({
      sections: { [SectionFici.FRAIS]: 'a'.repeat(LONGUEUR_MAX_SECTION + 1) },
    });
    expect(message).toContain(`dépasse ${LONGUEUR_MAX_SECTION} caractères`);
  });

  it("refuse une section qui n'est pas du texte", async () => {
    const message = await messageDe({ sections: { [SectionFici.FRAIS]: 42 } });
    expect(message).toContain('doit être du texte');
  });

  it('refuse sections en tableau ou en chaîne', async () => {
    expect(await messageDe({ sections: ['a'] })).toContain('objet clé/valeur');
    expect(await messageDe({ sections: 'texte libre' })).toContain(
      'objet clé/valeur',
    );
  });

  it('refuse une langue hors liste', async () => {
    const message = await messageDe({
      sections: sectionsCompletes(),
      langue: 'de',
    });
    expect(message).toContain('langue');
  });

  it('refuse un nombre de pages non entier ou hors bornes', async () => {
    expect(
      await messageDe({ sections: sectionsCompletes(), nombrePages: 0 }),
    ).toContain('nombrePages');
    expect(
      await messageDe({ sections: sectionsCompletes(), nombrePages: 1_000 }),
    ).toContain('nombrePages');
  });

  it('refuse un champ hors DTO (whitelist)', async () => {
    const message = await messageDe({
      sections: sectionsCompletes(),
      version: 99,
    });
    expect(message).toContain('version');
  });
});
