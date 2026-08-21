import { UpdateProfilPMUseCase } from './update-profil-pm.usecase';
import { GetProfilPMUseCase } from './get-profil-pm.usecase';
import type { ProfilPMRepository } from 'src/iam/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/iam/domain/aggregates/profil-pm';
import { ProfilPMFactory } from 'src/iam/domain/factories/profil-pm.factory';
import {
  ChampProfilInvalideError,
  ProfilPMIntrouvableError,
} from 'src/iam/domain/errors';
import { UpdateProfilPMDto } from 'src/iam/presentation/http/dto/profil.dto';

/** SIREN valide au sens de la clé de Luhn — voir `siren.vo.spec.ts`. */
const SIREN = '404833048';

function monter(existant: ProfilPM | null) {
  // Les mocks sont tenus à part plutôt que relus sur le port : lire une
  // méthode d'interface pour l'inspecter la détache de son objet.
  const mocks = {
    findByUserId: jest.fn().mockResolvedValue(existant),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
    update: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
  };
  const profilPMRepository: ProfilPMRepository = mocks;

  return {
    majProfilPM: new UpdateProfilPMUseCase(profilPMRepository),
    getProfilPM: new GetProfilPMUseCase(profilPMRepository),
    mocks,
  };
}

function profilExistant(): ProfilPM {
  return ProfilPMFactory.creer({
    utilisateurId: 42,
    raisonSociale: 'Ancien nom',
    secteurActivite: 'Immobilier',
  });
}

describe('GetProfilPMUseCase', () => {
  it('rend le profil du compte', async () => {
    const { getProfilPM } = monter(profilExistant());

    const profil = await getProfilPM.execute(42);

    expect(profil.identiteLegale.raisonSociale).toBe('Ancien nom');
  });

  it("signale l'absence de profil plutôt que de rendre null", async () => {
    const { getProfilPM } = monter(null);

    await expect(getProfilPM.execute(42)).rejects.toBeInstanceOf(
      ProfilPMIntrouvableError,
    );
  });
});

describe('UpdateProfilPMUseCase', () => {
  it('applique les champs déclarés et persiste', async () => {
    const { majProfilPM, mocks } = monter(profilExistant());

    const profil = await majProfilPM.execute(42, {
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
      majProfilPM.execute(42, { raisonSociale: 'X' } as UpdateProfilPMDto),
    ).rejects.toBeInstanceOf(ProfilPMIntrouvableError);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('ne persiste rien quand une donnée déclarée est refusée', async () => {
    const { majProfilPM, mocks } = monter(profilExistant());

    await expect(
      majProfilPM.execute(42, { siren: '404833049' } as UpdateProfilPMDto),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("n'expose pas le représentant légal au formulaire", async () => {
    const { majProfilPM } = monter(profilExistant());

    // Se désigner signataire des bulletins de souscription en glissant une clé
    // dans un PATCH serait une prise de contrôle : le mapper l'écarte.
    const profil = await majProfilPM.execute(42, {
      representantId: 999,
    } as unknown as UpdateProfilPMDto);

    expect(profil.aUnRepresentant()).toBe(false);
  });

  it('comble le trou laissé par la création idempotente', async () => {
    // `POST /profiles/pm/me` rend le profil existant sans appliquer le corps :
    // c'est par ce chemin-ci qu'une correction prend effet.
    const { majProfilPM } = monter(profilExistant());

    const profil = await majProfilPM.execute(42, {
      raisonSociale: 'Nom corrigé',
    } as UpdateProfilPMDto);

    expect(profil.identiteLegale.raisonSociale).toBe('Nom corrigé');
  });
});
