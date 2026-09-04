import { areTestEndpointsEnabled } from './test-endpoints.policy';

/**
 * Lot 2-back — `POST /test/email` et `POST /test/sms` sont `@Public()` et
 * déclenchent des envois réels. Ils ne doivent jamais être exposés hors des
 * environnements où c'est explicitement prévu, même si l'opt-in
 * `ENABLE_TEST_ENDPOINTS` a été recopié par erreur dans un ConfigMap ou un
 * fichier d'environnement.
 *
 * Durcissement : la règle est passée d'une LISTE NOIRE (production, staging) à
 * une LISTE BLANCHE. La liste noire laissait ouvert tout environnement qu'elle
 * n'avait pas nommé — `preprod`, `recette`, une faute de frappe, ou un
 * `NODE_ENV` absent, qui est justement le cas d'un déploiement mal configuré.
 */
describe('areTestEndpointsEnabled', () => {
  it.each(['development', 'test', 'local', 'DEVELOPMENT', ' Test '])(
    "autorise en %s avec l'opt-in explicite",
    (nodeEnv) => {
      expect(
        areTestEndpointsEnabled({
          ENABLE_TEST_ENDPOINTS: 'true',
          NODE_ENV: nodeEnv,
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    },
  );

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

  it.each(['preprod', 'recette', 'prod', 'qa', 'sandbox', 'demo'])(
    "refuse en %s : un environnement non nommé n'est plus un environnement ouvert",
    (nodeEnv) => {
      expect(
        areTestEndpointsEnabled({
          ENABLE_TEST_ENDPOINTS: 'true',
          NODE_ENV: nodeEnv,
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    },
  );

  it('NODE_ENV ABSENT : fermé — le cas le plus probable est une configuration oubliée', () => {
    expect(
      areTestEndpointsEnabled({
        ENABLE_TEST_ENDPOINTS: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('NODE_ENV vide : fermé, pour la même raison', () => {
    expect(
      areTestEndpointsEnabled({
        ENABLE_TEST_ENDPOINTS: 'true',
        NODE_ENV: '',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

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

  it('environnement vide : fermé par défaut', () => {
    expect(areTestEndpointsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
