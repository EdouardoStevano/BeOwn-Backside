import { CreateProfilPMUseCase } from './create-profil-pm.usecase';
import type { ProfilPMRepository } from 'src/compliance/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';
import { ProfilPMFactory } from 'src/compliance/domain/factories/profil-pm.factory';
import { ChampProfilInvalideError } from 'src/compliance/domain/errors';
import { CreateProfilPMDto } from 'src/compliance/presentation/http/dto/profil.dto';

/** SIREN valide au sens de la clé de Luhn — voir `siren.vo.spec.ts`. */
const SIREN = '404833048';

function monter(existant: ProfilPM | null = null) {
  // Les mocks sont tenus à part plutôt que relus sur le port : lire une
  // méthode d'interface pour l'inspecter la détache de son objet.
  const mocks = {
    findByUserId: jest.fn().mockResolvedValue(existant),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
    update: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
  };
  const profilPMRepository: ProfilPMRepository = mocks;

  return { useCase: new CreateProfilPMUseCase(profilPMRepository), mocks };
}

const DTO = { raisonSociale: 'BeOwn' } as CreateProfilPMDto;

describe('CreateProfilPMUseCase', () => {
  it('fait naître le profil à partir des données déclarées', async () => {
    const { useCase } = monter();

    const profil = await useCase.execute(42, {
      raisonSociale: '  BeOwn   SAS ',
      formeJuridique: 'sas',
      siren: '404 833 048',
      capitalSocial: 50_000,
    } as CreateProfilPMDto);

    expect(profil.utilisateurId).toBe(42);
    expect(profil.identiteLegale.raisonSociale).toBe('BeOwn SAS');
    expect(profil.identiteLegale.formeJuridique).toBe('SAS');
    expect(profil.identiteLegale.siren).toBe(SIREN);
    expect(profil.capitalSocial).toBe(50_000);
  });

  it('ne persiste rien quand une donnée déclarée est refusée', async () => {
    const { useCase, mocks } = monter();

    await expect(
      useCase.execute(42, {
        raisonSociale: 'BeOwn',
        siren: '404833049',
      } as CreateProfilPMDto),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("n'expose pas le représentant légal au formulaire", async () => {
    const { useCase } = monter();

    // On ne se désigne pas représentant d'une société en le déclarant dans un
    // POST : la clé est ignorée même si elle atteint le use case.
    const profil = await useCase.execute(42, {
      raisonSociale: 'BeOwn',
      representantId: 999,
    } as unknown as CreateProfilPMDto);

    expect(profil.aUnRepresentant()).toBe(false);
  });

  it('est idempotent : un second appel rend le profil existant', async () => {
    const existant = ProfilPMFactory.creer({
      utilisateurId: 42,
      raisonSociale: 'BeOwn',
    });
    const { useCase, mocks } = monter(existant);

    const profil = await useCase.execute(42, DTO);

    expect(profil).toBe(existant);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('ignore silencieusement les données du second appel', async () => {
    // Comportement conservé de l'implémentation d'origine, mais c'est un
    // piège : corriger sa raison sociale par ce chemin ne produit aucun effet
    // et rend pourtant un 201. À traiter le jour où une route de mise à jour
    // du profil moral existera.
    const existant = ProfilPMFactory.creer({
      utilisateurId: 42,
      raisonSociale: 'Ancien nom',
    });
    const { useCase } = monter(existant);

    const profil = await useCase.execute(42, {
      raisonSociale: 'Nouveau nom',
    } as CreateProfilPMDto);

    expect(profil.identiteLegale.raisonSociale).toBe('Ancien nom');
  });
});
