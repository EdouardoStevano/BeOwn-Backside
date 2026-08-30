import { ResolveProjectWalletUseCase } from './resolve-project-wallet.usecase';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

/**
 * Le wallet technique d'un projet est créé à la demande. Un doublon
 * scinderait le solde du projet en deux et rendrait le montant dû au porteur
 * incalculable : l'idempotence n'est pas un confort, c'est une exigence.
 *
 * Le harnais simule la barrière réelle : le VERROU sur la ligne projet, qui
 * sérialise toutes les écritures financières d'un projet. Deux appels
 * concurrents sur le même projet ne peuvent donc pas s'entrelacer entre la
 * lecture et l'insertion.
 */
describe('ResolveProjectWalletUseCase — idempotence du wallet projet', () => {
  const PROJET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  let walletsEnBase: any[];
  let verrouProjet: Promise<void>;
  let useCase: ResolveProjectWalletUseCase;
  let compteurInserts: number;

  /**
   * EntityManager simulé. `findOne(ProjectEntity, {lock})` prend un verrou
   * exclusif : tant qu'un appelant le détient, l'autre attend — exactement ce
   * que fait `SELECT ... FOR UPDATE` en base.
   */
  const buildManager = () => ({
    findOne: jest.fn(async (entity: any, options: any) => {
      if (entity === ProjectEntity) {
        // Acquisition du verrou : sérialise les appels concurrents.
        const precedent = verrouProjet;
        let libere!: () => void;
        verrouProjet = new Promise<void>((resolve) => (libere = resolve));
        await precedent;
        // Le verrou est relâché à la fin du tour de transaction simulé.
        setTimeout(libere, 0);
        return { id: PROJET_ID };
      }
      if (entity === WalletEntity) {
        const where = options?.where ?? {};
        return (
          walletsEnBase.find(
            (w) => w.projetId === where.projetId && w.type === where.type,
          ) ?? null
        );
      }
      return null;
    }),
    save: jest.fn(async (_entity: any, obj: any) => {
      compteurInserts += 1;
      const cree = { ...obj, id: `wp-${compteurInserts}` };
      walletsEnBase.push(cree);
      return cree;
    }),
  });

  beforeEach(() => {
    walletsEnBase = [];
    compteurInserts = 0;
    verrouProjet = Promise.resolve();
    useCase = new ResolveProjectWalletUseCase();
  });

  it('crée le wallet technique à la demande, rattaché au projet et à solde nul', async () => {
    const manager: any = buildManager();

    const wallet = await useCase.executeInTransaction(manager, PROJET_ID);

    expect(wallet.type).toBe(WalletType.TECHNIQUE_PROJET);
    expect(wallet.projetId).toBe(PROJET_ID);
    expect(wallet.solde).toBe(0);
    expect(wallet.soldeBloque).toBe(0);
    expect(wallet.proprietaireUserId).toBeNull();
    expect(wallet.devise).toBe('EUR');
    expect(compteurInserts).toBe(1);
  });

  it('appel répété : réutilise le wallet existant, aucune seconde création', async () => {
    const manager: any = buildManager();

    const premier = await useCase.executeInTransaction(manager, PROJET_ID);
    const second = await useCase.executeInTransaction(manager, PROJET_ID);

    expect(second.id).toBe(premier.id);
    expect(compteurInserts).toBe(1);
    expect(walletsEnBase).toHaveLength(1);
  });

  it('DEUX APPELS SIMULTANÉS : un seul wallet est créé et les deux renvoient le même', async () => {
    const manager: any = buildManager();

    const [a, b] = await Promise.all([
      useCase.executeInTransaction(manager, PROJET_ID),
      useCase.executeInTransaction(manager, PROJET_ID),
    ]);

    // Idempotence : le verrou projet a sérialisé les deux appels.
    expect(compteurInserts).toBe(1);
    expect(walletsEnBase).toHaveLength(1);
    expect(a.id).toBe(b.id);
  });

  it('la résolution verrouille la ligne projet puis la ligne wallet', async () => {
    const manager: any = buildManager();

    await useCase.executeInTransaction(manager, PROJET_ID);

    const lockProjet = manager.findOne.mock.calls.find(
      (c: any) => c[0] === ProjectEntity,
    );
    const lockWallet = manager.findOne.mock.calls.find(
      (c: any) => c[0] === WalletEntity,
    );
    expect(lockProjet[1].lock).toEqual({ mode: 'pessimistic_write' });
    expect(lockWallet[1].lock).toEqual({ mode: 'pessimistic_write' });
  });

  it('verrouillerProjet:false — l’appelant détient déjà le verrou, aucune relecture du projet', async () => {
    const manager: any = buildManager();

    await useCase.executeInTransaction(manager, PROJET_ID, {
      verrouillerProjet: false,
      devise: 'XOF',
    });

    expect(
      manager.findOne.mock.calls.some((c: any) => c[0] === ProjectEntity),
    ).toBe(false);
    expect(walletsEnBase[0].devise).toBe('XOF');
  });

  it('findInTransaction : lecture seule, ne crée jamais de wallet', async () => {
    const manager: any = buildManager();

    const absent = await useCase.findInTransaction(manager, PROJET_ID);

    expect(absent).toBeNull();
    expect(compteurInserts).toBe(0);
  });
});
