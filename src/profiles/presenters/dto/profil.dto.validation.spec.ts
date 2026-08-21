import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateProfilPPDto } from './profil.dto';
import { ProfileController } from '../http/profile.controller';

/**
 * Non-régression du correctif C-3 : `PATCH /profiles/pp/me` typait son body
 * `Partial<CreateProfilPPDto>` — un type effacé en `Object` au runtime, que le
 * `ValidationPipe` (whitelist + forbidNonWhitelisted) ne valide PAS. Le use
 * case faisant ensuite un `Object.assign`, n'importe quel utilisateur
 * authentifié pouvait écrire `utilisateurId` (clé primaire → profil KYC d'un
 * autre investisseur) et `categoriePsfp` (plafond PSFP + délai de
 * rétractation).
 *
 * Ces tests exécutent le pipe avec EXACTEMENT la configuration de `main.ts`.
 */
describe('UpdateProfilPPDto — validation du PATCH profil PP (C-3)', () => {
  // Config identique à app.useGlobalPipes(...) dans main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const meta: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateProfilPPDto,
    data: '',
  };

  it('le body du contrôleur est métatypé sur une vraie classe (plus `Object`)', () => {
    const types = Reflect.getMetadata(
      'design:paramtypes',
      ProfileController.prototype,
      'updateMyProfilePP',
    );
    // [ActiveUser, UpdateProfilPPDto] — un `Partial<T>` donnerait `Object`,
    // ce qui suffirait à désactiver le pipe.
    expect(types[1]).toBe(UpdateProfilPPDto);
    expect(types[1]).not.toBe(Object);
  });

  it('accepte une mise à jour partielle valide', async () => {
    const out = await pipe.transform({ ville: 'Paris', pays: 'FR' }, meta);
    expect(out).toBeInstanceOf(UpdateProfilPPDto);
    expect(out.ville).toBe('Paris');
  });

  it('accepte un body vide (tous les champs sont optionnels)', async () => {
    const out = await pipe.transform({}, meta);
    expect(out).toBeInstanceOf(UpdateProfilPPDto);
  });

  it('REJETTE `utilisateurId` — écriture sur le profil d’un autre utilisateur', async () => {
    await expect(
      pipe.transform({ utilisateurId: 999999, nom: 'Attaquant' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJETTE `categoriePsfp` — contournement du plafond PSFP et de la rétractation', async () => {
    await expect(
      pipe.transform({ categoriePsfp: 'averti' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJETTE tout autre champ inconnu', async () => {
    await expect(
      pipe.transform({ ville: 'Paris', champInconnu: 'x' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJETTE une valeur au mauvais format (code pays sur 2 caractères)', async () => {
    await expect(
      pipe.transform({ pays: 'FRANCE' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
