import { ValidationPipe } from '@nestjs/common';
import { UserStatus, UserType } from 'src/iam/domains/enums/user.enum';
import {
  PreferenceBooleanDto,
  PreferenceLangueDto,
  SetUserTypeDto,
  UpdatePreferencesDto,
  UpdateUserAdminDto,
} from 'src/iam/presenters/http/dto/user.dto';
import { CreateOrdreMarcheDto } from 'src/secondarymarket/presenters/dto/ordre-marche.dto';
import { CreateReservationAdminDto } from 'src/admin/admin-reservations.controller';
import {
  CreatePaymentIntentDto,
  CreateRetraitDto,
} from 'src/payments/presenters/dto/payment.dto';
import { CreateBailDto } from 'src/locative-management/presenters/dto/bail.dto';
import { OrdreMarcheSens } from 'src/secondarymarket/domains/ordre-marche';

/**
 * Validation des corps de requête, éprouvée avec le VRAI `ValidationPipe`
 * configuré comme en production (`main.ts`).
 *
 * Un DTO n'est pas validé parce qu'il est écrit : il l'est parce que Nest voit
 * une CLASSE en métadonnée de type et qu'elle porte des décorateurs. Sept
 * routes de préférences typaient leur corps par une interface inline, effacée
 * à la compilation — le pipe recevait `Object` et ne vérifiait rien. D'autres
 * DTO étaient bien des classes, mais sans décorateur.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const valider = <T>(metatype: new () => T, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype } as any);

describe('ValidationPipe — corps des bascules de préférences', () => {
  it.each([
    ['corps vide', {}],
    ['valeur textuelle', { value: 'oui' }],
    ['valeur nulle', { value: null }],
    ['valeur numérique', { value: 2 }],
    ['champ surnuméraire', { value: true, isAdmin: true }],
  ])('rejette %s', async (_cas, corps) => {
    await expect(valider(PreferenceBooleanDto, corps)).rejects.toThrow();
  });

  /**
   * Le cas qui inversait un consentement : la conversion implicite du pipe
   * global rend `Boolean("false") === true`. Un client envoyant la CHAÎNE
   * `"false"` pour couper les e-mails marketing les activait, avec un 200.
   */
  it.each(['false', '0', 'true', '1'])(
    'rejette la chaîne %s au lieu de la convertir silencieusement',
    async (valeur) => {
      await expect(
        valider(PreferenceBooleanDto, { value: valeur }),
      ).rejects.toThrow();
    },
  );

  it.each([true, false])('accepte le booléen %s', async (value) => {
    await expect(valider(PreferenceBooleanDto, { value })).resolves.toEqual({
      value,
    });
  });

  it('langue : rejette une locale hors liste', async () => {
    await expect(valider(PreferenceLangueDto, { value: 'zz' })).rejects.toThrow();
  });

  it('langue : accepte fr', async () => {
    await expect(valider(PreferenceLangueDto, { value: 'fr' })).resolves.toEqual(
      { value: 'fr' },
    );
  });

  it('bulk : le même durcissement vaut pour PATCH /users/me/preferences', async () => {
    await expect(
      valider(UpdatePreferencesDto, { notifMarketing: 'false' }),
    ).rejects.toThrow();
    await expect(
      valider(UpdatePreferencesDto, { notifMarketing: false }),
    ).resolves.toEqual({ notifMarketing: false });
  });
});

describe('ValidationPipe — SetUserTypeDto', () => {
  it('rejette un type inconnu', async () => {
    await expect(valider(SetUserTypeDto, { userType: 'SARL' })).rejects.toThrow();
  });

  it('rejette un corps sans userType', async () => {
    await expect(valider(SetUserTypeDto, {})).rejects.toThrow();
  });

  it.each([UserType.PP, UserType.PM])('accepte %s', async (userType) => {
    await expect(valider(SetUserTypeDto, { userType })).resolves.toEqual({
      userType,
    });
  });
});

describe('ValidationPipe — UpdateUserAdminDto.status', () => {
  it("rejette un statut hors du vocabulaire du domaine", async () => {
    // Aucune garde ne rattrapait un statut inconnu : `AccountStatusGuard` ne
    // refuse que suspendu/clos/supprimé, donc le compte restait actif avec une
    // valeur de statut corrompue en base.
    await expect(
      valider(UpdateUserAdminDto, { status: 'desactive' }),
    ).rejects.toThrow();
  });

  it.each(Object.values(UserStatus))('accepte %s', async (status) => {
    await expect(valider(UpdateUserAdminDto, { status })).resolves.toEqual({
      status,
    });
  });
});

describe('ValidationPipe — CreateOrdreMarcheDto', () => {
  const valide = {
    investissementId: '3f0b8b9e-6a1e-4d3a-9c1f-2b8a7c6d5e4f',
    sens: OrdreMarcheSens.VENTE,
    nbFractions: 10,
    prixUnitaire: 100,
    montant: 1000,
  };

  it('rejette un nombre de fractions décimal (titre indivisible)', async () => {
    await expect(
      valider(CreateOrdreMarcheDto, { ...valide, nbFractions: 2.5 }),
    ).rejects.toThrow();
  });

  it('rejette un nombre de fractions nul ou négatif', async () => {
    await expect(
      valider(CreateOrdreMarcheDto, { ...valide, nbFractions: 0 }),
    ).rejects.toThrow();
    await expect(
      valider(CreateOrdreMarcheDto, { ...valide, nbFractions: -3 }),
    ).rejects.toThrow();
  });

  it("rejette un investissementId qui n'est pas un UUID", async () => {
    await expect(
      valider(CreateOrdreMarcheDto, { ...valide, investissementId: 'inv-1' }),
    ).rejects.toThrow();
  });

  it('accepte un ordre bien formé', async () => {
    await expect(valider(CreateOrdreMarcheDto, valide)).resolves.toMatchObject({
      nbFractions: 10,
    });
  });
});

describe('ValidationPipe — CreateReservationAdminDto', () => {
  const valide = {
    projectId: '3f0b8b9e-6a1e-4d3a-9c1f-2b8a7c6d5e4f',
    userId: 7,
    montantReserve: 1500,
  };

  it('rejette un corps entièrement vide (aucun décorateur = aucun contrôle)', async () => {
    await expect(valider(CreateReservationAdminDto, {})).rejects.toThrow();
  });

  it.each([0, -100, 'beaucoup'])(
    'rejette le montant %s',
    async (montantReserve) => {
      await expect(
        valider(CreateReservationAdminDto, { ...valide, montantReserve }),
      ).rejects.toThrow();
    },
  );

  it("rejette un projectId qui n'est pas un UUID", async () => {
    await expect(
      valider(CreateReservationAdminDto, { ...valide, projectId: 'proj-1' }),
    ).rejects.toThrow();
  });

  it('rejette un userId non entier positif', async () => {
    await expect(
      valider(CreateReservationAdminDto, { ...valide, userId: -1 }),
    ).rejects.toThrow();
  });

  it('accepte une réservation bien formée', async () => {
    await expect(
      valider(CreateReservationAdminDto, valide),
    ).resolves.toMatchObject({ userId: 7, montantReserve: 1500 });
  });
});

/**
 * Les montants vivent en `decimal(18,2)`. Un DTO qui accepte trois décimales
 * laisse entrer un centime fantôme : la valeur est arrondie à l'écriture, et
 * l'écart — invisible — se retrouve au rapprochement du grand livre.
 */
describe('ValidationPipe — bornes décimales des montants', () => {
  it.each([
    ['dépôt', CreatePaymentIntentDto, { amount: 100.999, currency: 'EUR' }],
    [
      'retrait',
      CreateRetraitDto,
      { amount: 100.999, currency: 'EUR' },
    ],
  ])('rejette un montant à trois décimales (%s)', async (_cas, dto, corps) => {
    await expect(valider(dto as any, corps)).rejects.toThrow();
  });

  it.each([
    ['dépôt', CreatePaymentIntentDto, { amount: 100.99, currency: 'EUR' }],
    ['retrait', CreateRetraitDto, { amount: 100.99, currency: 'EUR' }],
  ])('accepte deux décimales (%s)', async (_cas, dto, corps) => {
    await expect(valider(dto as any, corps)).resolves.toMatchObject({
      amount: 100.99,
    });
  });

  it('rejette un loyer à trois décimales', async () => {
    await expect(
      valider(CreateBailDto, {
        uniteLouableId: '3f0b8b9e-6a1e-4d3a-9c1f-2b8a7c6d5e4f',
        locataire: { nom: 'Martin', prenom: 'Léa' },
        loyerMensuel: 800.125,
        dateDebut: '2026-09-01',
        spvId: '3f0b8b9e-6a1e-4d3a-9c1f-2b8a7c6d5e4e',
      }),
    ).rejects.toThrow();
  });
});

describe('ValidationPipe — CreateRetraitDto.walletId', () => {
  const valide = { amount: 100, currency: 'EUR' };

  it("rejette un walletId qui n'est pas un UUID", async () => {
    await expect(
      valider(CreateRetraitDto, { ...valide, walletId: 'w-seller' }),
    ).rejects.toThrow();
  });

  it('accepte un walletId UUID', async () => {
    await expect(
      valider(CreateRetraitDto, {
        ...valide,
        walletId: '3f0b8b9e-6a1e-4d3a-9c1f-2b8a7c6d5e4f',
      }),
    ).resolves.toMatchObject({ walletId: '3f0b8b9e-6a1e-4d3a-9c1f-2b8a7c6d5e4f' });
  });

  it('reste optionnel (parcours Stripe Connect)', async () => {
    await expect(valider(CreateRetraitDto, valide)).resolves.toMatchObject({
      amount: 100,
    });
  });
});
