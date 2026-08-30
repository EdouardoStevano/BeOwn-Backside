import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { UploadDocumentDto } from './document.dto';

/**
 * Lot 11a — fiabilite des drapeaux booleens de l'upload de documents.
 *
 * L'upload passe par `multipart/form-data` : toutes les valeurs arrivent en
 * chaine. Le `ValidationPipe` global (`src/main.ts`) est configure avec
 * `enableImplicitConversion: true`, qui convertit une chaine en booleen via
 * `Boolean(value)` — donc `Boolean('false') === true`.
 *
 * Defaut constate AVANT correction (sortie jointe au compte rendu du lot) :
 *   isPublic recu "false"        -> true
 *   isPublic recu "nimportequoi" -> true
 * Aucun document ne pouvait donc rester prive.
 *
 * Ces tests instancient le VRAI `ValidationPipe` avec exactement les options de
 * `src/main.ts` : ils valident la chaine reelle, pas une reimplementation.
 */
describe('UploadDocumentDto — conversion des drapeaux booleens', () => {
  // Copie conforme de src/main.ts (useGlobalPipes).
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const metadata = {
    type: 'body',
    metatype: UploadDocumentDto,
  } as ArgumentMetadata;

  /** Corps multipart minimal valide, auquel on greffe le champ teste. */
  const body = (champs: Record<string, unknown>) => ({
    type: 'PROSPECTUS',
    relatedTo: 'PROJECT',
    projectId: '11111111-1111-1111-1111-111111111111',
    ...champs,
  });

  const transform = (champs: Record<string, unknown>) =>
    pipe.transform(body(champs), metadata) as Promise<UploadDocumentDto>;

  describe.each(['isPublic', 'estPrincipale'] as const)('%s', (champ) => {
    it.each([
      ['la chaine multipart "false"', 'false', false],
      ['la chaine multipart "true"', 'true', true],
      ['la chaine multipart "0"', '0', false],
      ['la chaine multipart "1"', '1', true],
      ['le booleen false', false, false],
      ['le booleen true', true, true],
      ['la chaine "False" (casse ignoree)', 'False', false],
      ['la chaine " true " (espaces ignores)', ' true ', true],
    ])('%s donne %p -> %p', async (_libelle, entree, attendu) => {
      const dto = await transform({ [champ]: entree });

      expect(dto[champ]).toBe(attendu);
      expect(typeof dto[champ]).toBe('boolean');
    });

    it('absent du corps : le champ reste undefined (defaut applique par le controleur : false)', async () => {
      const dto = await transform({});

      expect(dto[champ]).toBeUndefined();
    });

    it('null : traite comme absent', async () => {
      const dto = await transform({ [champ]: null });

      expect(dto[champ]).toBeUndefined();
    });

    it.each([
      ['une chaine libre', 'oui'],
      ['une chaine vide', ''],
      ['un nombre', 2],
      ['un objet', { a: 1 }],
    ])(
      '%s est refusee en 400, jamais interpretee par defaut',
      async (_libelle, entree) => {
        await expect(transform({ [champ]: entree })).rejects.toBeInstanceOf(
          BadRequestException,
        );

        const erreur = await transform({ [champ]: entree }).catch((e) => e);
        const messages = (erreur.getResponse() as { message: string[] }).message;
        expect(messages.join(' ')).toContain(champ);
      },
    );
  });

  it('les deux drapeaux sont independants', async () => {
    const dto = await transform({ isPublic: 'false', estPrincipale: 'true' });

    expect(dto.isPublic).toBe(false);
    expect(dto.estPrincipale).toBe(true);
  });

  it("l'appelant historique (Admin/Frontside) qui envoie isPublic='true' reste public", async () => {
    // "BeOwn - Admin"/src/pages/ProjectEdit.tsx et ProjectCreate.tsx,
    // Frontside/src/data/dataSource/porteur.datasource.ts : fd.append('isPublic', 'true').
    const dto = await transform({ isPublic: 'true' });

    expect(dto.isPublic).toBe(true);
  });

  it('les autres champs du DTO restent inchanges (ordre converti en nombre)', async () => {
    const dto = await transform({ ordre: '3', isPublic: 'false' });

    expect(dto.ordre).toBe(3);
    expect(dto.type).toBe('PROSPECTUS');
    expect(dto.relatedTo).toBe('PROJECT');
    expect(dto.projectId).toBe('11111111-1111-1111-1111-111111111111');
  });
});
