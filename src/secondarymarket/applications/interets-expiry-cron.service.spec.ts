import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import {
  delaiInteretMs,
  InteretsExpiryCronService,
} from './interets-expiry-cron.service';

/**
 * I(a) — UNE MARQUE D'INTÉRÊT SANS RÉPONSE BLOQUAIT DEUX PERSONNES, SANS TERME.
 *
 * L'expression d'intérêt sort l'annonce du carnet en attendant la réponse du
 * vendeur. Si celui-ci ne répondait jamais, RIEN ne se passait : l'annonce
 * restait indéfiniment invisible des autres acheteurs, et celui qui s'était
 * manifesté n'était ni servi ni informé.
 */
describe('InteretsExpiryCronService', () => {
  const MAINTENANT = new Date('2026-09-05T12:00:00.000Z');
  const VENDEUR = 7;
  const ACHETEUR = 9;

  const annonce = (over: Record<string, unknown> = {}) => ({
    id: 'ordre-1',
    vendeurId: VENDEUR,
    acheteurId: ACHETEUR,
    statut: OrdreMarcheStatus.INTERET_EXPRIME,
    nbFractions: 10,
    prixUnitaire: 100,
    interetNbFractions: 3,
    interetExprimeLe: new Date('2026-09-01T12:00:00.000Z'),
    ...over,
  });

  const construire = ({
    candidats = [annonce()],
    transitionAffected = 1,
    verrouObtenu = true as boolean | null,
  } = {}) => {
    const transitions: any[] = [];
    const ordreRepo: any = {
      find: jest.fn().mockResolvedValue(candidats),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        const params: Record<string, any> = {};
        qb.update = () => qb;
        qb.set = (v: any) => {
          qb._set = v;
          return qb;
        };
        qb.where = (_c: string, p: any) => {
          Object.assign(params, p);
          return qb;
        };
        qb.execute = async () => {
          transitions.push({ set: qb._set, params });
          return { affected: transitionAffected };
        };
        return qb;
      }),
    };
    const notifications: any = { push: jest.fn().mockResolvedValue(undefined) };
    const verrou: any =
      verrouObtenu === null
        ? undefined
        : {
            executerSiSeul: jest.fn(async (_nom: string, traitement: any) =>
              verrouObtenu ? traitement() : null,
            ),
          };

    return {
      service: new InteretsExpiryCronService(ordreRepo, notifications, verrou),
      ordreRepo,
      notifications,
      transitions,
      verrou,
    };
  };

  it('expire une marque d’intérêt sans réponse et republie l’annonce', async () => {
    const h = construire();

    await expect(
      h.service.expirerInteretsSansReponse(MAINTENANT),
    ).resolves.toBe(1);

    expect(h.transitions).toHaveLength(1);
    expect(h.transitions[0].set).toMatchObject({
      statut: OrdreMarcheStatus.EN_CARNET,
      acheteurId: null,
      interetNbFractions: null,
    });
  });

  it('la transition est CONDITIONNELLE sur interet_exprime', async () => {
    const h = construire();

    await h.service.expirerInteretsSansReponse(MAINTENANT);

    // Une annonce que le vendeur vient d'accepter ne doit jamais être
    // rétrogradée par ce balayage.
    expect(h.transitions[0].params.attendu).toBe(
      OrdreMarcheStatus.INTERET_EXPRIME,
    );
  });

  it('prévient LES DEUX parties', async () => {
    const h = construire();

    await h.service.expirerInteretsSansReponse(MAINTENANT);

    const destinataires = h.notifications.push.mock.calls.map(
      (appel: any[]) => appel[0].utilisateurId,
    );
    expect(destinataires).toEqual(expect.arrayContaining([VENDEUR, ACHETEUR]));
  });

  it('dit à l’acheteur qu’AUCUN montant n’avait été engagé', async () => {
    // Une marque d'intérêt n'engage rien — c'est ce qui la distingue d'une
    // acceptation (art. 25). Le message ne doit pas laisser croire à un
    // remboursement.
    const h = construire();

    await h.service.expirerInteretsSansReponse(MAINTENANT);

    const versAcheteur = h.notifications.push.mock.calls.find(
      (appel: any[]) => appel[0].utilisateurId === ACHETEUR,
    )[0];
    expect(versAcheteur.message).toContain("Aucun montant n'avait été engagé");
  });

  it('ne notifie personne si la transition n’a pas eu lieu', async () => {
    const h = construire({ transitionAffected: 0 });

    await expect(
      h.service.expirerInteretsSansReponse(MAINTENANT),
    ).resolves.toBe(0);
    expect(h.notifications.push).not.toHaveBeenCalled();
  });

  it('un échec isolé n’arrête pas le balayage', async () => {
    const h = construire({
      candidats: [annonce({ id: 'ko' }), annonce({ id: 'ok' })],
    });
    let premier = true;
    h.ordreRepo.createQueryBuilder = jest.fn(() => {
      const echoue = premier;
      premier = false;
      const qb: any = {};
      qb.update = () => qb;
      qb.set = () => qb;
      qb.where = () => qb;
      qb.execute = async () => {
        if (echoue) throw new Error('base indisponible');
        return { affected: 1 };
      };
      return qb;
    });

    await expect(
      h.service.expirerInteretsSansReponse(MAINTENANT),
    ).resolves.toBe(1);
  });

  describe('verrou distribué', () => {
    it('ne balaie PAS quand le verrou est tenu par une autre réplique', async () => {
      const h = construire({ verrouObtenu: false });

      await expect(
        h.service.expirerInteretsSansReponse(MAINTENANT),
      ).resolves.toBe(0);
      expect(h.ordreRepo.find).not.toHaveBeenCalled();
    });

    it('balaie normalement sans verrou injecté (specs, mono-instance)', async () => {
      const h = construire({ verrouObtenu: null });

      await expect(
        h.service.expirerInteretsSansReponse(MAINTENANT),
      ).resolves.toBe(1);
    });
  });

  describe('delaiInteretMs', () => {
    it('vaut 72 h par défaut', () => {
      expect(delaiInteretMs({} as NodeJS.ProcessEnv)).toBe(72 * 3600 * 1000);
    });

    it('suit SECONDARY_INTEREST_TTL_HOURS', () => {
      expect(
        delaiInteretMs({ SECONDARY_INTEREST_TTL_HOURS: '24' } as NodeJS.ProcessEnv),
      ).toBe(24 * 3600 * 1000);
    });

    it.each(['0', '-5', 'abc', ''])(
      'retombe sur le défaut pour une valeur illisible (%s)',
      (valeur) => {
        expect(
          delaiInteretMs({
            SECONDARY_INTEREST_TTL_HOURS: valeur,
          } as NodeJS.ProcessEnv),
        ).toBe(72 * 3600 * 1000);
      },
    );
  });
});
