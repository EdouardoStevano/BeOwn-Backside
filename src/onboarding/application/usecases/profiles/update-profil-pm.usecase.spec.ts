import { UpdateProfilPMUseCase } from './update-profil-pm.usecase';
import { GetProfilPMUseCase } from './get-profil-pm.usecase';
import type { ProfilPMRepository } from 'src/onboarding/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/onboarding/domain/aggregates/profil-pm';
import { ProfilPMMapper } from 'src/onboarding/domain/mappers/profil-pm.mapper';
import {
  ChampProfilInvalideError,
  ProfilPMIntrouvableError,
} from 'src/onboarding/domain/errors';
import { UpdateProfilPMDto } from 'src/onboarding/presentation/http/dto/profil.dto';

/** SIREN valide au sens de la clé de Luhn — voir `siren.vo.spec.ts`. */
const SIREN = '404833048';

const PM_ID = 'a7f1c0d2-5e3b-4c81-9f26-0b4d7e8a3c15';

function monter(existant: ProfilPM | null) {
  // Les mocks sont tenus à part plutôt que relus sur le port : lire une
  // méthode d'interface pour l'inspecter la détache de son objet.
  const mocks = {
    findById: jest.fn().mockResolvedValue(existant),
    listerParUtilisateur: jest.fn().mockResolvedValue([]),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
    update: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
  };
  const profilPMRepository: ProfilPMRepository = mocks;
  const getProfilPM = new GetProfilPMUseCase(profilPMRepository);

  return {
    majProfilPM: new UpdateProfilPMUseCase(profilPMRepository, getProfilPM),
    getProfilPM,
    mocks,
  };
}

/**
 * Une société du compte 42. `restore` plutôt que la fabrique : celle-ci laisse
 * l'identité à la persistance, or c'est précisément par elle qu'on désigne
 * désormais le dossier.
 */
function profilExistant(userId = 42): ProfilPM {
  return ProfilPMMapper.restore({
    id: PM_ID,
    userId,
    raisonSociale: 'Ancien nom',
    secteurActivite: 'Immobilier',
    formeJuridique: null,
    siren: null,
    rcsVille: null,
    capitalSocial: null,
    siegeAdresse: null,
    representantId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });
}

describe('GetProfilPMUseCase', () => {
  it('rend la société désignée', async () => {
    const { getProfilPM } = monter(profilExistant());

    const profil = await getProfilPM.execute(42, PM_ID);

    expect(profil.identiteLegale.raisonSociale).toBe('Ancien nom');
  });

  it("signale l'absence de profil plutôt que de rendre null", async () => {
    const { getProfilPM } = monter(null);

    await expect(getProfilPM.execute(42, PM_ID)).rejects.toBeInstanceOf(
      ProfilPMIntrouvableError,
    );
  });

  it("refuse la société d'un autre, sans confirmer qu'elle existe", async () => {
    // « Introuvable » et non « interdit » : un 403 dirait au demandeur que
    // l'identifiant qu'il a essayé correspond à quelque chose.
    const { getProfilPM } = monter(profilExistant(99));

    await expect(getProfilPM.execute(42, PM_ID)).rejects.toBeInstanceOf(
      ProfilPMIntrouvableError,
    );
  });
});

describe('UpdateProfilPMUseCase', () => {
  it('applique les champs déclarés et persiste', async () => {
    const { majProfilPM, mocks } = monter(profilExistant());

    const profil = await majProfilPM.execute(42, PM_ID, {
      raisonSociale: 'Nouveau nom',
      siren: '404 833 048',
    } as UpdateProfilPMDto);

    expect(profil.identiteLegale.raisonSociale).toBe('Nouveau nom');
    expect(profil.identiteLegale.siren).toBe(SIREN);
    // Champ absent du corps : conservé.
    expect(profil.secteurActivite).toBe('Immobilier');
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("refuse de mettre à jour un profil qui n'existe pas", async () => {
    const { majProfilPM, mocks } = monter(null);

    await expect(
      majProfilPM.execute(42, PM_ID, {
        raisonSociale: 'X',
      } as UpdateProfilPMDto),
    ).rejects.toBeInstanceOf(ProfilPMIntrouvableError);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('ne persiste rien quand une donnée déclarée est refusée', async () => {
    const { majProfilPM, mocks } = monter(profilExistant());

    await expect(
      majProfilPM.execute(42, PM_ID, {
        siren: '404833049',
      } as UpdateProfilPMDto),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("n'expose pas le représentant légal au formulaire", async () => {
    const { majProfilPM } = monter(profilExistant());

    // Se désigner signataire des bulletins de souscription en glissant une clé
    // dans un PATCH serait une prise de contrôle : le mapper l'écarte.
    const profil = await majProfilPM.execute(42, PM_ID, {
      representantId: 999,
    } as unknown as UpdateProfilPMDto);

    expect(profil.aUnRepresentant()).toBe(false);
  });

  it('corrige une société sans en créer une seconde', async () => {
    // `POST /profils/pm/me` déclare désormais une société de plus : corriger
    // celle qui existe passe forcément par ce chemin-ci.
    const { majProfilPM } = monter(profilExistant());

    const profil = await majProfilPM.execute(42, PM_ID, {
      raisonSociale: 'Nom corrigé',
    } as UpdateProfilPMDto);

    expect(profil.identiteLegale.raisonSociale).toBe('Nom corrigé');
  });
});
