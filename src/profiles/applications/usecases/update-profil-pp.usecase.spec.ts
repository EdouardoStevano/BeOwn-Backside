import { NotFoundException } from '@nestjs/common';
import { UpdateProfilPPUseCase } from './update-profil-pp.usecase';

/**
 * Non-régression C-3, côté application : même si un jour la frontière HTTP
 * laissait repasser des champs arbitraires (DTO mal typé, autre appelant du
 * use case), la couche application ne doit assigner QUE les champs modifiables
 * par le titulaire du profil. L'`Object.assign` d'origine ne le garantissait
 * pas.
 */
describe('UpdateProfilPPUseCase — liste blanche de champs (C-3)', () => {
  const profilCourant = () => ({
    utilisateurId: 42,
    prenom: 'Victime',
    nom: 'Legitime',
    ville: 'Lyon',
    pep: true,
    categoriePsfp: 'non_averti',
    patrimoineDeclare: 10_000,
    montantMaxConseille: 500,
  });

  const makeRepo = () => {
    const state: { persiste: any } = { persiste: null };
    const repo = {
      findProfilPPByUserId: jest.fn().mockResolvedValue(profilCourant()),
      updateProfilPP: jest.fn().mockImplementation((p) => {
        state.persiste = p;
        return Promise.resolve(p);
      }),
    };
    return { repo, state };
  };

  it('applique les champs autorisés', async () => {
    const { repo, state } = makeRepo();
    const usecase = new UpdateProfilPPUseCase(repo as any);

    await usecase.execute(42, { ville: 'Paris', telephone: '+33612345678' });

    expect(state.persiste.ville).toBe('Paris');
    expect(state.persiste.telephone).toBe('+33612345678');
  });

  it("n'assigne PAS `utilisateurId` (la clé primaire reste celle du titulaire)", async () => {
    const { repo, state } = makeRepo();
    const usecase = new UpdateProfilPPUseCase(repo as any);

    await usecase.execute(42, { utilisateurId: 999999, nom: 'Attaquant' } as any);

    expect(state.persiste.utilisateurId).toBe(42);
    expect(state.persiste.nom).toBe('Legitime');
  });

  it("n'assigne PAS `categoriePsfp` ni les montants issus du questionnaire", async () => {
    const { repo, state } = makeRepo();
    const usecase = new UpdateProfilPPUseCase(repo as any);

    await usecase.execute(42, {
      categoriePsfp: 'averti',
      patrimoineDeclare: 99_000_000,
      montantMaxConseille: 99_000_000,
    } as any);

    expect(state.persiste.categoriePsfp).toBe('non_averti');
    expect(state.persiste.patrimoineDeclare).toBe(10_000);
    expect(state.persiste.montantMaxConseille).toBe(500);
  });

  it('laisse inchangés les champs non transmis', async () => {
    const { repo, state } = makeRepo();
    const usecase = new UpdateProfilPPUseCase(repo as any);

    await usecase.execute(42, { ville: 'Paris' });

    expect(state.persiste.pep).toBe(true);
    expect(state.persiste.prenom).toBe('Victime');
  });

  it('remonte une 404 si le profil est absent', async () => {
    const repo = {
      findProfilPPByUserId: jest.fn().mockResolvedValue(null),
      updateProfilPP: jest.fn(),
    };
    const usecase = new UpdateProfilPPUseCase(repo as any);

    await expect(usecase.execute(42, { ville: 'Paris' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.updateProfilPP).not.toHaveBeenCalled();
  });
});
