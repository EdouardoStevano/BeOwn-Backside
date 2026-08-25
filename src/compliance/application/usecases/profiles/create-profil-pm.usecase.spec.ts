import { CreateProfilPMUseCase } from './create-profil-pm.usecase';
import type { ProfilPMRepository } from 'src/compliance/domain/repositories/profil-pm.repository';
import type { NatureDuDossierRepository } from 'src/compliance/domain/repositories/nature-du-dossier.repository';
import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';
import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';
import {
  ChampProfilInvalideError,
  NatureDeDossierIncompatibleError,
} from 'src/compliance/domain/errors';
import { CreateProfilPMDto } from 'src/compliance/presentation/http/dto/profil.dto';

/** SIREN valide au sens de la clé de Luhn — voir `siren.vo.spec.ts`. */
const SIREN = '404833048';

/**
 * @param natureEtablie ce que le registre oppose au compte : `PM` s'il n'a rien
 * déclaré d'autre — le registre rend alors la nature qu'on vient d'y poser.
 */
function monter(natureEtablie: NatureDeDossier = NatureDeDossier.PM) {
  // Les mocks sont tenus à part plutôt que relus sur le port : lire une
  // méthode d'interface pour l'inspecter la détache de son objet.
  const mocks = {
    findById: jest.fn().mockResolvedValue(null),
    listerParUtilisateur: jest.fn().mockResolvedValue([]),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
    update: jest.fn((profil: ProfilPM) => Promise.resolve(profil)),
    declarer: jest.fn().mockResolvedValue(natureEtablie),
  };
  const profilPMRepository: ProfilPMRepository = mocks;
  const natureDuDossier: NatureDuDossierRepository = mocks;

  return {
    useCase: new CreateProfilPMUseCase(profilPMRepository, natureDuDossier),
    mocks,
  };
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

    expect(profil.userId).toBe(42);
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

  it('ne fixe pas la nature du compte quand le formulaire est refusé', async () => {
    // Un premier essai fautif ne doit pas engager le titulaire pour la suite :
    // il pourrait encore vouloir ouvrir un dossier personne physique.
    const { useCase, mocks } = monter();

    await expect(
      useCase.execute(42, {
        raisonSociale: 'BeOwn',
        siren: '404833049',
      } as CreateProfilPMDto),
    ).rejects.toBeInstanceOf(ChampProfilInvalideError);
    expect(mocks.declarer).not.toHaveBeenCalled();
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

  it('déclare une société de plus à chaque appel', async () => {
    // Le repli idempotent a disparu avec la relation 1:1 : un compte peut
    // déclarer plusieurs sociétés, et le second appel n'est plus un doublon à
    // absorber mais une seconde déclaration.
    const { useCase, mocks } = monter();

    await useCase.execute(42, DTO);
    const second = await useCase.execute(42, {
      raisonSociale: 'BeOwn Capital',
    } as CreateProfilPMDto);

    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(second.identiteLegale.raisonSociale).toBe('BeOwn Capital');
  });

  it('refuse une société sur un compte déjà personne physique', async () => {
    const { useCase, mocks } = monter(NatureDeDossier.PP);

    await expect(useCase.execute(42, DTO)).rejects.toBeInstanceOf(
      NatureDeDossierIncompatibleError,
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('rend compte des deux natures dans son erreur', async () => {
    // « C'est interdit » n'aide personne ; « votre compte est un dossier
    // personne physique » se lit à l'écran.
    const { useCase } = monter(NatureDeDossier.PP);

    const erreur = (await useCase
      .execute(42, DTO)
      .catch((e: unknown) => e)) as NatureDeDossierIncompatibleError;

    expect(erreur.demandee).toBe(NatureDeDossier.PM);
    expect(erreur.etablie).toBe(NatureDeDossier.PP);
  });
});
