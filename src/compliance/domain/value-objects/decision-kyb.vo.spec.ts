import { StatutKyb } from 'src/compliance/domain/enums/statut-kyb.enum';
import { KybPasEnInstructionError } from 'src/compliance/domain/errors';
import { DecisionKyb } from './decision-kyb.vo';

const RCCI = 7;
const LE = new Date('2026-08-28T10:00:00Z');

/** Un dossier complet, en attente de la décision de l'équipe conformité. */
const enInstruction = () => DecisionKyb.initiale().soumise(LE);

describe('DecisionKyb', () => {
  describe('initiale', () => {
    it('naît en constitution, jamais valide', () => {
      // Le seul défaut acceptable : un dossier né `VALIDE` autoriserait une
      // société à déposer, souscrire et retirer sans qu'aucun justificatif ait
      // été examiné.
      const decision = DecisionKyb.initiale();

      expect(decision.statut).toBe(StatutKyb.EN_CONSTITUTION);
      expect(decision.estValide()).toBe(false);
      expect(decision.decideePar).toBeNull();
    });
  });

  describe('soumise', () => {
    it('envoie en instruction un dossier en constitution', () => {
      expect(enInstruction().statut).toBe(StatutKyb.EN_INSTRUCTION);
      expect(enInstruction().estEnInstruction()).toBe(true);
    });

    it('reste sans effet sur un dossier déjà instruit — les événements se redélivrent', () => {
      const dejaSoumis = enInstruction();

      expect(dejaSoumis.soumise(new Date('2026-09-01'))).toBe(dejaSoumis);
    });

    it('ne renvoie pas en instruction un dossier déjà tranché', () => {
      // Accepter une pièce de plus ne doit pas défaire une décision : seul
      // `rouverte` le peut, et il dit pourquoi.
      const valide = enInstruction().validee(null, RCCI, LE);

      expect(valide.soumise(LE).statut).toBe(StatutKyb.VALIDE);
    });
  });

  describe('validee', () => {
    it('valide un dossier en instruction, en gardant qui a tranché et quand', () => {
      const decision = enInstruction().validee('2027-08-28', RCCI, LE);

      expect(decision.statut).toBe(StatutKyb.VALIDE);
      expect(decision.valideJusquAu).toBe('2027-08-28');
      expect(decision.decideePar).toBe(RCCI);
      expect(decision.decideeLe).toEqual(LE);
    });

    it('efface le motif hérité d’une remise en constitution', () => {
      // Garder « KBIS illisible » sur un dossier validé donnerait à lire deux
      // choses contradictoires au RCCI comme au titulaire.
      const decision = DecisionKyb.initiale()
        .rouverte('KBIS illisible')
        .soumise(LE)
        .validee(null, RCCI, LE);

      expect(decision.motifRefus).toBeNull();
    });

    it.each([StatutKyb.EN_CONSTITUTION, StatutKyb.VALIDE, StatutKyb.REFUSE])(
      'refuse de valider depuis %s',
      (statut) => {
        // Sans cette garde, un dossier auquel il manque un KBIS pourrait être
        // validé d'un appel — ce qui suffit à ouvrir les opérations
        // financières au nom de la société.
        const decision = DecisionKyb.restore({ kybStatut: statut });

        expect(() => decision.validee(null, RCCI, LE)).toThrow(
          KybPasEnInstructionError,
        );
      },
    );
  });

  describe('refusee', () => {
    it('rejette un dossier en instruction, motif à l’appui', () => {
      const decision = enInstruction().refusee('Statuts non signés', RCCI, LE);

      expect(decision.statut).toBe(StatutKyb.REFUSE);
      expect(decision.motifRefus).toBe('Statuts non signés');
      expect(decision.estValide()).toBe(false);
    });

    it('efface l’échéance d’une validation précédente', () => {
      // Une validité qui survivrait au refus rouvrirait l'accès aux opérations
      // financières à la première relecture qui ne regarderait que la date.
      const decision = enInstruction()
        .validee('2027-08-28', RCCI, LE)
        .rouverte('Bénéficiaire non documenté')
        .soumise(LE)
        .refusee('Registre incohérent', RCCI, LE);

      expect(decision.valideJusquAu).toBeNull();
    });

    it('refuse de trancher un dossier qui n’est pas en instruction', () => {
      expect(() =>
        DecisionKyb.initiale().refusee('trop tôt', RCCI, LE),
      ).toThrow(KybPasEnInstructionError);
    });
  });

  describe('rouverte', () => {
    it.each([
      StatutKyb.EN_CONSTITUTION,
      StatutKyb.EN_INSTRUCTION,
      StatutKyb.VALIDE,
      StatutKyb.REFUSE,
    ])('est légale depuis %s', (statut) => {
      const decision = DecisionKyb.restore({
        kybStatut: statut,
        kybValideJusquAu: '2027-08-28',
      }).rouverte('KBIS remplacé');

      expect(decision.statut).toBe(StatutKyb.EN_CONSTITUTION);
      expect(decision.motifRefus).toBe('KBIS remplacé');
    });

    it('révoque un KYB validé avant son échéance', () => {
      // C'est le seul chemin par lequel une société cesse de pouvoir opérer
      // sans attendre l'expiration de sa validité.
      const valide = enInstruction().validee('2099-01-01', RCCI, LE);
      expect(valide.estValide(LE)).toBe(true);

      const revoque = valide.rouverte('Pièce d’identité périmée');
      expect(revoque.estValide(LE)).toBe(false);
      expect(revoque.valideJusquAu).toBeNull();
      expect(revoque.decideePar).toBeNull();
    });
  });

  describe('estValide', () => {
    it('laisse opérer une société validée sans échéance', () => {
      expect(enInstruction().validee(null, RCCI, LE).estValide()).toBe(true);
    });

    it("s'éprouve à une date donnée, sans dépendre de l'horloge", () => {
      const decision = enInstruction().validee('2026-06-30', RCCI, LE);

      expect(decision.estValide(new Date('2026-06-29'))).toBe(true);
      expect(decision.estValide(new Date('2026-07-01'))).toBe(false);
    });
  });

  describe('restore', () => {
    it('replie une ligne sans statut sur la constitution', () => {
      // Le repli des lignes écrites avant que ces colonnes n'existent. Se
      // tromper dans l'autre sens laisserait opérer une société jamais
      // instruite.
      expect(DecisionKyb.restore({}).statut).toBe(StatutKyb.EN_CONSTITUTION);
      expect(DecisionKyb.restore({}).estValide()).toBe(false);
    });

    it('ramène à la date civile ce que le driver rend de la colonne `date`', () => {
      const depuisChaine = DecisionKyb.restore({
        kybStatut: StatutKyb.VALIDE,
        kybValideJusquAu: '2027-08-28',
      });
      const depuisDate = DecisionKyb.restore({
        kybStatut: StatutKyb.VALIDE,
        kybValideJusquAu: new Date('2027-08-28T00:00:00Z'),
      });

      expect(depuisChaine.valideJusquAu).toBe('2027-08-28');
      expect(depuisDate.valideJusquAu).toBe('2027-08-28');
    });

    it('rend un instant pour la date de décision, pas une date civile', () => {
      const decision = DecisionKyb.restore({
        kybDecideeLe: '2026-08-28T10:00:00.000Z',
      });

      expect(decision.decideeLe).toEqual(LE);
    });
  });

  describe('toSnapshot', () => {
    it('rend les cinq colonnes de la table, à plat', () => {
      expect(
        enInstruction().validee('2027-08-28', RCCI, LE).toSnapshot(),
      ).toEqual({
        kybStatut: StatutKyb.VALIDE,
        kybMotifRefus: null,
        kybValideJusquAu: '2027-08-28',
        kybDecideeLe: LE,
        kybDecideePar: RCCI,
      });
    });
  });
});
