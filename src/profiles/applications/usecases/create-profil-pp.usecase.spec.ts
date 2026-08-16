import { CreateProfilPPUseCase } from './create-profil-pp.usecase';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import type { ProfilPPRepository } from 'src/profiles/domains/ports/profil-pp.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPPFactory } from 'src/profiles/domains/factories/profil-pp.factory';
import {
  ChampProfilInvalideError,
  ProfilPPDejaExistantError,
} from 'src/profiles/domains/errors';
import { CategoriePsfp } from 'src/profiles/domains/enums/kyc-status.enum';
import { CreateProfilPPDto } from 'src/profiles/presenters/dto/profil.dto';

/**
 * Le port ne porte plus que le profil PP : le mock tient en deux méthodes, là
 * où l'ancien `ProfilRepository` en imposait onze — dont la sauvegarde d'un
 * profil moral et six opérations KYC, sans rapport avec ce use case (§4 — ISP).
 */
type PortPartiel = Pick<ProfilPPRepository, 'findByUserId' | 'save'>;

function monter(options: {
  existant?: ProfilPP | null;
  compte?: { firstname?: string; lastname?: string | null } | null;
}) {
  const profilPPRepository: PortPartiel = {
    findByUserId: jest.fn().mockResolvedValue(options.existant ?? null),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((profil: ProfilPP) => Promise.resolve(profil)),
  };
  // Le port d'IAM, pas son entité ORM : le faux ne rend que ce que le use case
  // lit du compte — son prénom et son nom.
  const userRepository = {
    findById: jest.fn().mockResolvedValue(options.compte ?? null),
  };

  const useCase = new CreateProfilPPUseCase(
    profilPPRepository as ProfilPPRepository,
    userRepository as unknown as UserRepository,
  );

  return { useCase, profilPPRepository, userRepository };
}

const DTO_VIDE = {} as CreateProfilPPDto;

describe('CreateProfilPPUseCase', () => {
  it('refuse un second profil pour le même compte', async () => {
    const { useCase, profilPPRepository } = monter({
      existant: ProfilPPFactory.creer({
        utilisateurId: 42,
        prenom: 'Awa',
        nom: 'Koné',
      }),
    });

    await expect(useCase.execute(42, DTO_VIDE)).rejects.toBeInstanceOf(
      ProfilPPDejaExistantError,
    );
    expect(profilPPRepository.save).not.toHaveBeenCalled();
  });

  it("reprend l'identité du compte, que le formulaire ne redemande pas", async () => {
    const { useCase } = monter({
      compte: { firstname: '  Awa ', lastname: 'Koné' },
    });

    const profil = await useCase.execute(42, DTO_VIDE);

    expect(profil.identite.prenom).toBe('Awa');
    expect(profil.identite.nom).toBe('Koné');
    expect(profil.identite.estConnue()).toBe(true);
  });

  it('crée le profil même si le compte est introuvable', async () => {
    const { useCase } = monter({ compte: null });

    const profil = await useCase.execute(42, DTO_VIDE);

    expect(profil.identite.estConnue()).toBe(false);
  });

  it('classe le nouvel investisseur en non averti', async () => {
    const { useCase } = monter({ compte: { firstname: 'Awa' } });

    const profil = await useCase.execute(42, DTO_VIDE);

    expect(profil.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
  });

  it("ignore les montants que seul le questionnaire d'adéquation peut fixer", async () => {
    const { useCase } = monter({ compte: { firstname: 'Awa' } });

    const profil = await useCase.execute(42, {
      patrimoineDeclare: 10_000_000,
      montantMaxConseille: 500_000,
    } as CreateProfilPPDto);

    expect(profil.patrimoineDeclare).toBeNull();
    expect(profil.evaluation.montantMaxConseille).toBeNull();
  });

  it('ne persiste rien quand une donnée déclarée est refusée', async () => {
    const { useCase, profilPPRepository } = monter({
      compte: { firstname: 'Awa' },
    });

    await expect(
      useCase.execute(42, { nationalite: 'ZZ' } as CreateProfilPPDto),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);
    expect(profilPPRepository.save).not.toHaveBeenCalled();
  });

  it('transmet au port un profil déjà éprouvé', async () => {
    const { useCase, profilPPRepository } = monter({
      compte: { firstname: 'Awa', lastname: 'Koné' },
    });

    await useCase.execute(42, {
      civilite: 'madame',
      pays: 'FR',
      codePostal: '75001',
      telephone: '0033612345678',
      residenceFiscale: 'FR',
      nif: '12 34 56 78 90',
    } as CreateProfilPPDto);

    const profil = jest.mocked(profilPPRepository.save).mock.calls[0][0];
    expect(profil.utilisateurId).toBe(42);
    expect(profil.identite.civilite).toBe('Mme');
    expect(profil.coordonnees.telephone).toBe('+33612345678');
    expect(profil.situationFiscale.nif).toBe('1234567890');
  });
});
