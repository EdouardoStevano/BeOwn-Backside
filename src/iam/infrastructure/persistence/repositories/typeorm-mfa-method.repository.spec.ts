import { Repository } from 'typeorm';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { MfaMethodEntity } from 'src/iam/infrastructure/persistence/entities/mfa-method.entity';
import { TypeOrmMfaMethodRepository } from './typeorm-mfa-method.repository';

const makeRepo = () => {
  const queryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const repo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn().mockResolvedValue({ id: 7 }),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };

  return {
    repository: new TypeOrmMfaMethodRepository(
      repo as unknown as Repository<MfaMethodEntity>,
    ),
    repo,
    queryBuilder,
  };
};

/**
 * Ce qui compte ici est le **cloisonnement par canal**. Tant que chaque canal
 * avait sa table fille, la portée d'un `deactivateAllForUser` était garantie
 * par construction. Sur une table unique, elle ne tient plus qu'au filtre
 * `method` : l'omettre retirerait à l'utilisateur ses autres facteurs.
 */
describe('TypeOrmMfaMethodRepository — cloisonnement par canal', () => {
  it('borne `deactivateChannel` au canal visé', async () => {
    const { repository, repo } = makeRepo();

    await repository.deactivateChannel(42, MfaMethodType.EMAIL);

    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ method: MfaMethodType.EMAIL }),
      { isActive: false },
    );
  });

  it('ne filtre sur aucun canal dans `deactivateAll`', async () => {
    // C'est ce qui tient l'invariant « au plus un facteur actif » : un filtre
    // `method` qui se glisserait ici laisserait survivre le facteur d'un autre
    // canal à l'activation.
    const { repository, repo } = makeRepo();

    await repository.deactivateAll(42);

    const [criteria] = repo.update.mock.calls[0] as [Record<string, unknown>];
    expect(criteria).not.toHaveProperty('method');
    expect(repo.update).toHaveBeenCalledWith(expect.anything(), {
      isActive: false,
    });
  });

  it('borne la purge des enrôlements en attente au canal visé', async () => {
    const { repository, repo } = makeRepo();

    await repository.deletePendingForUser(42, MfaMethodType.SMS);

    expect(repo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ method: MfaMethodType.SMS, isActive: false }),
    );
  });

  it('filtre la lecture sur le compte ET le canal', async () => {
    const { repository, queryBuilder } = makeRepo();

    await repository.findAllByUserId(42, MfaMethodType.TOTP);

    expect(queryBuilder.where).toHaveBeenCalledWith('mfa.user_id = :userId', {
      userId: 42,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('mfa.method = :method', {
      method: MfaMethodType.TOTP,
    });
  });

  it('réintroduit `credential`, que l’entité tient en select: false', async () => {
    // Sans cet `addSelect`, le secret TOTP reviendrait `undefined` et toute
    // vérification échouerait silencieusement.
    const { repository, queryBuilder } = makeRepo();

    await repository.findAllByUserId(42, MfaMethodType.TOTP);

    expect(queryBuilder.addSelect).toHaveBeenCalledWith('mfa.credential');
  });

  it('crée un facteur inactif portant son canal, et rend son identifiant', async () => {
    const { repository, repo } = makeRepo();

    const id = await repository.create(42, MfaMethodType.TOTP, 'enc(secret)');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        method: MfaMethodType.TOTP,
        credential: 'enc(secret)',
        isActive: false,
      }),
    );
    expect(id).toBe(7);
  });
});
