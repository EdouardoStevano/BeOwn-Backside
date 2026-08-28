import type { EventBus } from '@nestjs/cqrs';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { ProfilInvestisseur } from 'src/compliance/domain/value-objects/profil-investisseur.vo';
import { StatutKyb } from 'src/compliance/domain/enums/statut-kyb.enum';
import {
  KybPasEnInstructionError,
  ProfilPMIntrouvableError,
} from 'src/compliance/domain/errors';
import {
  KybRefuseDomainEvent,
  KybValideDomainEvent,
} from 'src/compliance/domain/events/kyb-tranche.domain-event';
import type { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import type { ProfilPMRepository } from 'src/compliance/domain/repositories/profil-pm.repository';
import { DeciderKybUseCase } from './decider-kyb.usecase';

const TITULAIRE = 42;
const SOCIETE = 'societe-1';
const RCCI = 7;

/** Une société dont le dossier réunit toutes ses pièces et attend la conformité. */
function racineEnInstruction(): InvestorComplianceProfile {
  const profil = InvestorComplianceProfile.vierge(
    TITULAIRE,
    ProfilInvestisseur.societe(SOCIETE),
  );
  profil.soumettreLeKybALinstruction();
  return profil;
}

function monter(
  profil = racineEnInstruction(),
  societe: unknown = { userId: TITULAIRE },
) {
  const publish = jest.fn();
  const save = jest.fn().mockImplementation((p: unknown) => Promise.resolve(p));

  const useCase = new DeciderKybUseCase(
    {
      parSociete: jest.fn().mockResolvedValue(profil),
      save,
    } as unknown as InvestorComplianceProfileRepository,
    {
      findById: jest.fn().mockResolvedValue(societe),
    } as unknown as ProfilPMRepository,
    { publish } as unknown as EventBus,
  );

  return { useCase, profil, publish, save };
}

describe('DeciderKybUseCase', () => {
  describe('valider', () => {
    it('rend la société apte, avec son échéance', async () => {
      const { useCase, profil } = monter();

      const verdict = await useCase.valider(SOCIETE, '2027-08-28', RCCI);

      expect(verdict).toEqual({
        societeId: SOCIETE,
        statut: StatutKyb.VALIDE,
        motifRefus: null,
        valideJusquAu: '2027-08-28',
      });
      expect(profil.peutOperer()).toBe(true);
    });

    it('accepte une validation sans terme', async () => {
      const { useCase } = monter();

      const verdict = await useCase.valider(SOCIETE, null, RCCI);

      expect(verdict.valideJusquAu).toBeNull();
    });

    it('annonce le fait après l’écriture, jamais avant', async () => {
      // Un abonné ne doit pas annoncer au titulaire une habilitation qui n'a
      // pas été enregistrée.
      const ordre: string[] = [];
      const { useCase, publish, save } = monter();
      save.mockImplementation((p: unknown) => {
        ordre.push('save');
        return Promise.resolve(p);
      });
      publish.mockImplementation(() => ordre.push('publish'));

      await useCase.valider(SOCIETE, null, RCCI);

      expect(ordre).toEqual(['save', 'publish']);
      expect(publish).toHaveBeenCalledWith(expect.any(KybValideDomainEvent));
    });

    it('refuse un dossier dont les pièces ne sont pas réunies', async () => {
      // La garde vit dans le domaine : sans elle, valider un dossier auquel il
      // manque un KBIS suffirait à ouvrir les opérations financières au nom de
      // la société.
      const enConstitution = InvestorComplianceProfile.vierge(
        TITULAIRE,
        ProfilInvestisseur.societe(SOCIETE),
      );
      const { useCase, publish } = monter(enConstitution);

      await expect(useCase.valider(SOCIETE, null, RCCI)).rejects.toThrow(
        KybPasEnInstructionError,
      );
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('refuser', () => {
    it('écarte le dossier, motif à l’appui', async () => {
      const { useCase, profil } = monter();

      const verdict = await useCase.refuser(
        SOCIETE,
        'Registre incohérent avec les statuts',
        RCCI,
      );

      expect(verdict.statut).toBe(StatutKyb.REFUSE);
      expect(verdict.motifRefus).toBe('Registre incohérent avec les statuts');
      expect(profil.peutOperer()).toBe(false);
    });

    it('annonce le refus au titulaire', async () => {
      // Un dossier dont toutes les pièces sont acceptées peut être rejeté :
      // aucun refus de pièce ne l'aurait appris au titulaire.
      const { useCase, publish } = monter();

      await useCase.refuser(SOCIETE, 'Actionnariat incohérent', RCCI);

      expect(publish).toHaveBeenCalledWith(expect.any(KybRefuseDomainEvent));
    });
  });

  it('refuse de trancher une société inconnue', async () => {
    // Relue avant tout : le dossier de conformité est clé sur le couple
    // compte/société, et le charger sans titulaire rendrait une racine vierge.
    const { useCase } = monter(racineEnInstruction(), null);

    await expect(useCase.valider(SOCIETE, null, RCCI)).rejects.toThrow(
      ProfilPMIntrouvableError,
    );
  });
});
