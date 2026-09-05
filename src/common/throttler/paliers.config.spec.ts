import { Controller, Get } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  lireEntierPositif,
  PALIERS_GLOBAUX_DEFAUT,
  palierAuthPoseExplicitement,
  sauterPalierAuth,
} from './paliers.config';
import { AuthenticationController } from 'src/iam/presenters/http/authentication.controller';
import { ProjectController } from 'src/projects/presenters/http/project.controller';

/**
 * Le palier `auth` (500 req / 15 min par IP, verrou de 15 min au dépassement)
 * était déclaré GLOBALEMENT : mesuré sous Artillery, 97,8 % de 429 dès
 * 34 req/s de trafic ANONYME sur la vitrine. Ces tests figent la règle qui le
 * remplace — évalué UNIQUEMENT là où il est posé — et le fait que les portes
 * d'authentification, elles, le portent toujours.
 */

/** Faux ExecutionContext : le `skipIf` du guard n'en lit que ces deux méthodes. */
const contexte = (
  handler: unknown,
  classe: unknown,
): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => classe,
  }) as unknown as ExecutionContext;

@Controller('vitrine')
class ControleurPublicTemoin {
  @Get()
  liste() {
    return [];
  }
}

@Throttle({ auth: { ttl: 60_000, limit: 5 } })
@Controller('sensible-classe')
class ControleurPalierDeClasse {
  @Get()
  liste() {
    return [];
  }
}

@Controller('sensible-methode')
class ControleurPalierDeMethode {
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @Get()
  connexion() {
    return null;
  }
}

describe('palier `auth` — opt-in par route', () => {
  it("n'est PAS appliqué à une route qui ne le pose pas (vitrine publique)", () => {
    const ctx = contexte(
      ControleurPublicTemoin.prototype.liste,
      ControleurPublicTemoin,
    );
    expect(palierAuthPoseExplicitement(ctx)).toBe(false);
    expect(sauterPalierAuth(ctx)).toBe(true);
  });

  it('est appliqué quand la MÉTHODE le pose', () => {
    const ctx = contexte(
      ControleurPalierDeMethode.prototype.connexion,
      ControleurPalierDeMethode,
    );
    expect(palierAuthPoseExplicitement(ctx)).toBe(true);
    expect(sauterPalierAuth(ctx)).toBe(false);
  });

  it('est appliqué quand la CLASSE le pose', () => {
    const ctx = contexte(
      ControleurPalierDeClasse.prototype.liste,
      ControleurPalierDeClasse,
    );
    expect(sauterPalierAuth(ctx)).toBe(false);
  });

  it('ne casse pas sur un contexte sans handler ni classe', () => {
    expect(sauterPalierAuth(contexte(undefined, undefined))).toBe(true);
  });
});

describe('palier `auth` — routes réelles', () => {
  it.each([
    ['signIn', 'POST /auth/sign-in'],
    ['resetPassword', 'POST /auth/reset-password'],
    ['enableMfa', 'POST /auth/mfa/enable'],
    ['sendVerification', "POST /auth/email/send-verification (OTP d'email)"],
    ['confirmEmail', 'GET /auth/email/verify (jeton à usage unique)'],
    ['exchange', 'POST /auth/exchange'],
  ])('%s reste limité par le palier auth (%s)', (methode) => {
    const ctx = contexte(
      (AuthenticationController.prototype as unknown as Record<string, unknown>)[
        methode
      ],
      AuthenticationController,
    );
    expect(palierAuthPoseExplicitement(ctx)).toBe(true);
  });

  it.each([
    ['listPublic', 'GET /projects/public'],
    ['findBySlug', 'GET /projects/slug/:slug'],
  ])('%s (%s) échappe au palier auth', (methode) => {
    const ctx = contexte(
      (ProjectController.prototype as unknown as Record<string, unknown>)[
        methode
      ],
      ProjectController,
    );
    expect(sauterPalierAuth(ctx)).toBe(true);
  });
});

describe('limites globales configurables', () => {
  const NOM = 'THROTTLE_TEST_LIMIT';
  const initial = process.env[NOM];

  afterEach(() => {
    if (initial === undefined) delete process.env[NOM];
    else process.env[NOM] = initial;
  });

  it('retombe sur le défaut quand la variable est absente ou vide', () => {
    delete process.env[NOM];
    expect(lireEntierPositif(NOM, PALIERS_GLOBAUX_DEFAUT.shortLimit)).toBe(500);
    process.env[NOM] = '   ';
    expect(lireEntierPositif(NOM, 500)).toBe(500);
  });

  it("lit la valeur d'environnement quand elle est valide", () => {
    process.env[NOM] = '120';
    expect(lireEntierPositif(NOM, 500)).toBe(120);
  });

  it.each(['0', '-5', 'beaucoup', '12.5'])(
    'refuse de démarrer sur une valeur invalide (%s) plutôt que de retomber en silence',
    (valeur) => {
      process.env[NOM] = valeur;
      expect(() => lireEntierPositif(NOM, 500)).toThrow(NOM);
    },
  );
});
