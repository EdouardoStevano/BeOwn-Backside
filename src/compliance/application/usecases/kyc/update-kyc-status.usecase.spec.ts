import { NotFoundException } from '@nestjs/common';
import { UpdateKycStatusUseCase } from './update-kyc-status.usecase';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import { buildUser } from 'src/iam/domain/aggregates/user.fixture';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import type { User } from 'src/iam/domain/aggregates/user';

const monter = (titulaire: User | null) => {
  const kycRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'kyc-1' }),
    updateStatus: jest.fn().mockResolvedValue({ id: 'kyc-1' }),
  };
  const userRepository = {
    findById: jest.fn().mockResolvedValue(titulaire),
    save: jest.fn((user: User) => Promise.resolve(user)),
  };

  return {
    usecase: new UpdateKycStatusUseCase(
      kycRepository as never,
      userRepository as never,
    ),
    kycRepository,
    userRepository,
  };
};

const visiteur = () => buildUser({ userId: 7, role: UserRole.VISITEUR });

describe('UpdateKycStatusUseCase — le rôle suit le dossier', () => {
  it('promeut le visiteur quand le dossier passe à VALIDE', async () => {
    const { usecase, userRepository } = monter(visiteur());

    await usecase.execute(7, KycStatus.VALIDE);

    expect(userRepository.save).toHaveBeenCalled();
    const promu = userRepository.save.mock.calls[0][0] as User;
    expect(promu.role).toBe(UserRole.INVESTISSEUR);
  });

  it.each([KycStatus.EN_COURS, KycStatus.REFUSE])(
    'ne promeut personne quand le dossier passe à %s',
    async (statut) => {
      const { usecase, userRepository } = monter(visiteur());

      await usecase.execute(7, statut);

      expect(userRepository.findById).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    },
  );

  it('n’écrit rien si le compte est déjà investisseur', async () => {
    const { usecase, userRepository } = monter(
      buildUser({ userId: 7, role: UserRole.INVESTISSEUR }),
    );

    await usecase.execute(7, KycStatus.VALIDE);

    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('ne déclasse pas un compte de back-office qui valide son propre dossier', async () => {
    const { usecase, userRepository } = monter(
      buildUser({ userId: 7, role: UserRole.RCCI }),
    );

    await usecase.execute(7, KycStatus.VALIDE);

    expect(userRepository.save).not.toHaveBeenCalled();
  });

  /**
   * La validation d'un dossier est acquise dès l'écriture du statut. Ce qui
   * autorise une opération financière reste `KycValidatedGuard`, qui interroge
   * le dossier et non le rôle : un rôle en retard ferme un accès, il n'en
   * ouvre aucun. Faire échouer la validation pour autant serait pire que le
   * mal.
   */
  describe('la promotion ne fait pas échouer la validation', () => {
    it('rend le dossier même si le compte est introuvable', async () => {
      const { usecase } = monter(null);

      await expect(usecase.execute(7, KycStatus.VALIDE)).resolves.toMatchObject(
        { id: 'kyc-1' },
      );
    });

    it('rend le dossier même si l’écriture du rôle échoue', async () => {
      const { usecase, userRepository } = monter(visiteur());
      userRepository.save.mockRejectedValue(new Error('base indisponible'));

      await expect(usecase.execute(7, KycStatus.VALIDE)).resolves.toMatchObject(
        { id: 'kyc-1' },
      );
    });
  });

  it('refuse un titulaire sans dossier', async () => {
    const { usecase, kycRepository } = monter(visiteur());
    kycRepository.findByUserId.mockResolvedValue(null);

    await expect(usecase.execute(7, KycStatus.VALIDE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
