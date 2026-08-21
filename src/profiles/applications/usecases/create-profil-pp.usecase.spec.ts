import type { EventBus } from '@nestjs/cqrs';
import { CreateProfilPPUseCase } from './create-profil-pp.usecase';
import { buildUser } from 'src/iam/domain/aggregates/user.fixture';
import type { User } from 'src/iam/domain/aggregates/user';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import type { ProfilPPRepository } from 'src/profiles/domains/ports/profil-pp.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPPFactory } from 'src/profiles/domains/factories/profil-pp.factory';
import {
  ChampProfilInvalideError,
  ProfilPPDejaExistantError,
} from 'src/profiles/domains/errors';
import { CategoriePsfp } from 'src/profiles/domains/enums/categorie-psfp.enum';
import { ProfilPPCreeDomainEvent } from 'src/profiles/domains/events/profil-pp-cree.domain-event';
import { CreateProfilPPDto } from 'src/profiles/presenters/dto/profil.dto';

/**
 * Le port ne porte plus que le profil PP : le mock tient en deux méthodes, là
 * où l'ancien `ProfilRepository` en imposait onze (§4 — ISP).
 */
type PortPartiel = Pick<ProfilPPRepository, 'findByUserId' | 'save'>;

function monter(
  options: {
    existant?: ProfilPP | null;
    compte?: User | null;
  } = {},
) {
  const compte =
    options.compte === undefined ? buildUser({ userId: 42 }) : options.compte;

  const profilPPRepository: PortPartiel = {
    findByUserId: jest.fn().mockResolvedValue(options.existant ?? null),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((profil: ProfilPP) => Promise.resolve(profil)),
  };
  const userRepository = {
    findById: jest.fn().mockResolvedValue(compte),
    update: jest.fn((u: User) => Promise.resolve(u)),
  };

  // Le report du téléphone sur le compte a quitté le use case : il est
  // désormais le fait d'un abonné, et ce qu'on éprouve ici est l'annonce.
  const eventBus = { publish: jest.fn() };

  const useCase = new CreateProfilPPUseCase(
    profilPPRepository as ProfilPPRepository,
    userRepository as unknown as UserRepository,
    eventBus as unknown as EventBus,
  );

  return { useCase, profilPPRepository, userRepository, eventBus, compte };
}

const DTO_VIDE = {} as CreateProfilPPDto;

describe('CreateProfilPPUseCase', () => {
  it('refuse un second profil pour le même compte', async () => {
    const { useCase, profilPPRepository } = monter({
      existant: ProfilPPFactory.creer({ utilisateurId: 42 }),
    });

    await expect(useCase.execute(42, DTO_VIDE)).rejects.toBeInstanceOf(
      ProfilPPDejaExistantError,
    );
    expect(profilPPRepository.save).not.toHaveBeenCalled();
  });

  it("publie l'état civil du compte, que le dossier ne porte plus", async () => {
    // `prenom` / `nom` ont quitté `profil_pp` : la réponse les recompose depuis
    // le compte, seule source désormais.
    const { useCase } = monter({
      compte: buildUser({ firstname: 'Awa', lastname: 'Koné' }),
    });

    const vue = await useCase.execute(42, DTO_VIDE);

    expect(vue.prenom).toBe('Awa');
    expect(vue.nom).toBe('Koné');
  });

  it('crée le profil même si le compte est introuvable', async () => {
    const { useCase } = monter({ compte: null });

    const vue = await useCase.execute(42, DTO_VIDE);

    expect(vue.utilisateurId).toBe(42);
    expect(vue.prenom).toBeNull();
  });

  it('classe le nouvel investisseur en non averti', async () => {
    const { useCase } = monter();

    const vue = await useCase.execute(42, DTO_VIDE);

    expect(vue.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
  });

  it("ignore les montants que seul le questionnaire d'adéquation peut fixer", async () => {
    const { useCase } = monter();

    const vue = await useCase.execute(42, {
      patrimoineDeclare: 10_000_000,
      montantMaxConseille: 500_000,
    } as CreateProfilPPDto);

    expect(vue.patrimoineDeclare).toBeNull();
    expect(vue.montantMaxConseille).toBeNull();
  });

  it('ne persiste rien quand une donnée déclarée est refusée', async () => {
    const { useCase, profilPPRepository, userRepository } = monter();

    await expect(
      useCase.execute(42, { nationalite: 'ZZ' } as CreateProfilPPDto),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);
    expect(profilPPRepository.save).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('transmet au port un profil déjà éprouvé', async () => {
    const { useCase, profilPPRepository } = monter();

    await useCase.execute(42, {
      civilite: 'madame',
      pays: 'FR',
      codePostal: '75001',
      residenceFiscale: 'FR',
      nif: '12 34 56 78 90',
    } as CreateProfilPPDto);

    const profil = jest.mocked(profilPPRepository.save).mock.calls[0][0];
    expect(profil.utilisateurId).toBe(42);
    expect(profil.identite.civilite).toBe('Mme');
    expect(profil.situationFiscale.nif).toBe('1234567890');
  });

  it('annonce le numéro déclaré plutôt que de le poser lui-même', async () => {
    // Le compte n'est plus écrit ici : `ProfilPPCreeEventHandler` s'en charge.
    const { useCase, userRepository, eventBus } = monter();

    await useCase.execute(42, {
      telephone: '0033612345678',
    } as CreateProfilPPDto);

    expect(userRepository.update).not.toHaveBeenCalled();
    const [event] = eventBus.publish.mock.calls[0] as [ProfilPPCreeDomainEvent];
    expect(event).toBeInstanceOf(ProfilPPCreeDomainEvent);
    expect(event.utilisateurId).toBe(42);
    expect(event.telephoneDeclare).toBe('0033612345678');
  });

  it('rend le numéro déclaré, que le compte ne porte pas encore', async () => {
    // Le report étant différé, relire la colonne rendrait l'ancien numéro à
    // qui vient d'en saisir un nouveau.
    const { useCase } = monter();

    const vue = await useCase.execute(42, {
      telephone: '0033612345678',
    } as CreateProfilPPDto);

    expect(vue.telephone).toBe('0033612345678');
  });

  it('annonce le fait même sans numéro déclaré', async () => {
    const { useCase, eventBus } = monter();

    await useCase.execute(42, DTO_VIDE);

    const [event] = eventBus.publish.mock.calls[0] as [ProfilPPCreeDomainEvent];
    expect(event.telephoneDeclare).toBeUndefined();
  });

  it("n'annonce rien quand le profil n'a pas pu naître", async () => {
    const { useCase, eventBus } = monter();

    await expect(
      useCase.execute(42, { nationalite: 'ZZ' } as CreateProfilPPDto),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
