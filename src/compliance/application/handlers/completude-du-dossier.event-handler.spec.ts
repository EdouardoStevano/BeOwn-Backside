import { Logger } from '@nestjs/common';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { ProfilInvestisseur } from 'src/compliance/domain/value-objects/profil-investisseur.vo';
import { StatutKyb } from 'src/compliance/domain/enums/statut-kyb.enum';
import { DossierDePiecesCompleteDomainEvent } from 'src/compliance/domain/events/dossier-de-pieces-complete.domain-event';
import { DossierDePiecesIncompletDomainEvent } from 'src/compliance/domain/events/dossier-de-pieces-incomplet.domain-event';
import type { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { CompletudeDuDossierEventHandler } from './completude-du-dossier.event-handler';

const TITULAIRE = 42;
const SOCIETE = 'societe-1';
const RCCI = 7;

const COMPLET = new DossierDePiecesCompleteDomainEvent(TITULAIRE, SOCIETE);
const INCOMPLET = new DossierDePiecesIncompletDomainEvent(
  TITULAIRE,
  SOCIETE,
  'Justificatifs à fournir : extrait KBIS.',
);

const racineDeLaSociete = () =>
  InvestorComplianceProfile.vierge(
    TITULAIRE,
    ProfilInvestisseur.societe(SOCIETE),
  );

function monter(profil = racineDeLaSociete()) {
  const parSociete = jest.fn().mockResolvedValue(profil);
  const save = jest.fn().mockResolvedValue(profil);

  const handler = new CompletudeDuDossierEventHandler({
    parSociete,
    save,
  } as unknown as InvestorComplianceProfileRepository);

  return { handler, profil, parSociete, save };
}

describe('CompletudeDuDossierEventHandler', () => {
  describe('le dossier devient complet', () => {
    it('envoie le KYB en instruction', async () => {
      const { handler, profil, save } = monter();

      await handler.handle(COMPLET);

      expect(profil.statutKyb).toBe(StatutKyb.EN_INSTRUCTION);
      expect(save).toHaveBeenCalledWith(profil);
    });

    it('ne valide pas — la décision reste humaine', async () => {
      // Complet veut dire « prêt à être lu », pas « accepté ». Valider ici
      // ferait dire au dossier qu'il a été instruit alors que personne ne l'a
      // ouvert : inopposable devant l'AMF.
      const { handler, profil } = monter();

      await handler.handle(COMPLET);

      expect(profil.peutOperer()).toBe(false);
    });

    it('ne défait pas une décision déjà prise', async () => {
      // Les événements se redélivrent, et accepter une pièce de plus sur un
      // dossier déjà validé ne doit pas le renvoyer en instruction.
      const profil = racineDeLaSociete();
      profil.soumettreLeKybALinstruction();
      profil.validerLeKyb(null, RCCI);

      const { handler } = monter(profil);
      await handler.handle(COMPLET);

      expect(profil.statutKyb).toBe(StatutKyb.VALIDE);
      expect(profil.peutOperer()).toBe(true);
    });

    it('charge la racine de la société, pas celle du titulaire', async () => {
      // `findByInvestorId` rendrait le dossier du représentant : on y écrirait
      // un état de société sur la ligne d'une personne physique.
      const { handler, parSociete } = monter();

      await handler.handle(COMPLET);

      expect(parSociete).toHaveBeenCalledWith(TITULAIRE, SOCIETE);
    });
  });

  describe('le dossier ne l’est plus', () => {
    it('révoque un KYB validé', async () => {
      // C'est le seul chemin par lequel une société cesse d'être habilitée
      // avant l'échéance de sa validité.
      const profil = racineDeLaSociete();
      profil.soumettreLeKybALinstruction();
      profil.validerLeKyb('2099-01-01', RCCI);
      expect(profil.peutOperer()).toBe(true);

      const { handler, save } = monter(profil);
      await handler.handle(INCOMPLET);

      expect(profil.peutOperer()).toBe(false);
      expect(profil.statutKyb).toBe(StatutKyb.EN_CONSTITUTION);
      expect(save).toHaveBeenCalledWith(profil);
    });

    it('reprend le motif tel quel — le titulaire lira celui-là', async () => {
      const { handler, profil } = monter();

      await handler.handle(INCOMPLET);

      expect(profil.motifRefusKyb).toBe(INCOMPLET.motif);
    });
  });

  describe('quand la racine est inaccessible', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('journalise sans relancer — le dossier de pièces reste acquis', async () => {
      // Le bus n'attend pas les réactions : relancer ne défait pas l'écriture
      // du dossier, cela ne ferait que remonter une erreur que personne ne
      // rattrape.
      const parSociete = jest
        .fn()
        .mockRejectedValue(new Error('base indisponible'));
      const handler = new CompletudeDuDossierEventHandler({
        parSociete,
        save: jest.fn(),
      } as unknown as InvestorComplianceProfileRepository);

      await expect(handler.handle(INCOMPLET)).resolves.toBeUndefined();
    });

    it('dit dans le journal ce qui est resté ouvert', async () => {
      // Les deux échecs n'ont pas la même conséquence : un `rouvrirLeKyb`
      // perdu laisse une société habilitée sans justificatif, et le message
      // doit le nommer pour qu'on le rattrape à la main.
      const erreur = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const handler = new CompletudeDuDossierEventHandler({
        parSociete: jest.fn().mockRejectedValue(new Error('base indisponible')),
        save: jest.fn(),
      } as unknown as InvestorComplianceProfileRepository);

      await handler.handle(INCOMPLET);

      expect(erreur.mock.calls[0][0]).toContain('rester habilitée à opérer');
    });
  });
});
