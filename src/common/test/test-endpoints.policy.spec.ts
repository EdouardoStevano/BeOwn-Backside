import { areTestEndpointsEnabled } from './test-endpoints.policy';

/**
 * Lot 2-back — `POST /test/email` et `POST /test/sms` sont `@Public()` et
 * déclenchent des envois réels. Ils ne doivent jamais être exposés en
 * production ni en staging, même si l'opt-in `ENABLE_TEST_ENDPOINTS` a été
 * recopié par erreur dans un ConfigMap ou un fichier d'environnement.
 */
describe('areTestEndpointsEnabled', () => {
  it.each(['production', 'staging', 'PRODUCTION', ' Staging '])(
    'refuse en %s même avec ENABLE_TEST_ENDPOINTS=true',
    (nodeEnv) => {
      expect(
        areTestEndpointsEnabled({
          ENABLE_TEST_ENDPOINTS: 'true',
          NODE_ENV: nodeEnv,
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    },
  );

  it.each(['development', 'test', 'local', ''])(
    'autorise en %s avec l\'opt-in explicite',
    (nodeEnv) => {
      expect(
        areTestEndpointsEnabled({
          ENABLE_TEST_ENDPOINTS: 'true',
          NODE_ENV: nodeEnv,
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    },
  );

  it.each([undefined, 'false', '1', 'TRUE', ''])(
    'reste fermé hors opt-in strict (ENABLE_TEST_ENDPOINTS=%s)',
    (flag) => {
      expect(
        areTestEndpointsEnabled({
          ...(flag === undefined ? {} : { ENABLE_TEST_ENDPOINTS: flag }),
          NODE_ENV: 'development',
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    },
  );

  it('NODE_ENV absent : l\'opt-in seul suffit (poste de développement)', () => {
    expect(
      areTestEndpointsEnabled({
        ENABLE_TEST_ENDPOINTS: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('environnement vide : fermé par défaut', () => {
    expect(areTestEndpointsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
