import { RepaymentSchedule } from './repayment-schedule';
import { Echeance, type EcheanceSnapshot } from '../entities/echeance';
import { EcheanceStatus } from '../enums/echeance.enum';
import { EcheanceIntrouvableError, EcheanceNonPayableError } from '../errors';

const INVESTISSEMENT = 'inv-1';

const echeance = (etat: Partial<EcheanceSnapshot> = {}): Echeance =>
  new Echeance({
    id: `ech-${etat.numero ?? 1}`,
    investissementId: INVESTISSEMENT,
    numero: 1,
    datePrevue: new Date('2026-02-15T00:00:00Z'),
    montantCapital: 0,
    montantInterets: 100,
    montantTotal: 100,
    prelevementIR: 0,
    prelevementCSG: 0,
    statut: EcheanceStatus.A_VENIR,
    payeLe: null,
    statutChangeLe: null,
    rappelJ7Envoye: false,
    rappelJ1Envoye: false,
    ...etat,
  });

/** Un in fine sur 3 mois : intérêts chaque mois, capital à la dernière. */
const inFine = (statuts: EcheanceStatus[]): RepaymentSchedule =>
  RepaymentSchedule.reconstituer(
    INVESTISSEMENT,
    statuts.map((statut, i) =>
      echeance({
        numero: i + 1,
        statut,
        montantCapital: i === statuts.length - 1 ? 1_200 : 0,
        montantInterets: 100,
        montantTotal: i === statuts.length - 1 ? 1_300 : 100,
      }),
    ),
  );

describe('RepaymentSchedule — reconstitution', () => {
  it('ordonne les échéances par numéro, quel que soit l’ordre reçu', () => {
    const echeancier = RepaymentSchedule.reconstituer(INVESTISSEMENT, [
      echeance({ numero: 3 }),
      echeance({ numero: 1 }),
      echeance({ numero: 2 }),
    ]);

    expect(echeancier.echeances.map((e) => e.numero)).toEqual([1, 2, 3]);
  });

  it('accepte un échéancier vide — celui d’un investissement non encore servi', () => {
    const echeancier = RepaymentSchedule.reconstituer(INVESTISSEMENT, []);

    expect(echeancier.estVide).toBe(true);
    expect(echeancier.prochaineEcheance).toBeNull();
  });
});

describe('RepaymentSchedule — règlement', () => {
  it('règle l’échéance visée et rend le détail du prélèvement', () => {
    const echeancier = inFine([EcheanceStatus.A_VENIR, EcheanceStatus.A_VENIR]);

    const prelevement = echeancier.payer('ech-1');

    expect(prelevement.prelevementIR).toBe(12.8);
    expect(prelevement.prelevementCSG).toBe(17.2);
    expect(echeancier.echeances[0].statut).toBe(EcheanceStatus.PAYE);
  });

  it('laisse les autres échéances intactes', () => {
    const echeancier = inFine([EcheanceStatus.A_VENIR, EcheanceStatus.A_VENIR]);

    echeancier.payer('ech-1');

    expect(echeancier.echeances[1].statut).toBe(EcheanceStatus.A_VENIR);
  });

  it('refuse une échéance qui n’appartient pas à cet échéancier', () => {
    const echeancier = inFine([EcheanceStatus.A_VENIR]);

    expect(() => echeancier.payer('ech-inconnue')).toThrow(
      EcheanceIntrouvableError,
    );
  });

  it('laisse l’échéance refuser un second règlement', () => {
    const echeancier = inFine([EcheanceStatus.PAYE]);

    expect(() => echeancier.payer('ech-1')).toThrow(EcheanceNonPayableError);
  });
});

describe('RepaymentSchedule — interrogations', () => {
  it('compte comme dû le capital des échéances non réglées', () => {
    const echeancier = inFine([
      EcheanceStatus.PAYE,
      EcheanceStatus.A_VENIR,
      EcheanceStatus.A_VENIR,
    ]);

    // Seule la dernière porte du capital, et elle n'est pas réglée.
    expect(echeancier.capitalRestantDu).toBe(1_200);
  });

  it('ne compte plus le capital une fois la dernière échéance réglée', () => {
    const echeancier = inFine([EcheanceStatus.PAYE, EcheanceStatus.PAYE]);

    expect(echeancier.capitalRestantDu).toBe(0);
  });

  it('somme les intérêts bruts des seules échéances réglées', () => {
    const echeancier = inFine([
      EcheanceStatus.PAYE,
      EcheanceStatus.PAYE,
      EcheanceStatus.A_VENIR,
    ]);

    expect(echeancier.interetsPercus).toBe(200);
  });

  it('somme la retenue à la source déjà prélevée', () => {
    const echeancier = RepaymentSchedule.reconstituer(INVESTISSEMENT, [
      echeance({
        numero: 1,
        statut: EcheanceStatus.PAYE,
        prelevementIR: 12.8,
        prelevementCSG: 17.2,
      }),
      echeance({ numero: 2 }),
    ]);

    expect(echeancier.prelevementsALaSource).toBe(30);
  });

  it('désigne comme prochaine la première échéance encore payable', () => {
    const echeancier = inFine([
      EcheanceStatus.PAYE,
      EcheanceStatus.RETARD_LEGER,
      EcheanceStatus.A_VENIR,
    ]);

    expect(echeancier.prochaineEcheance?.numero).toBe(2);
  });

  it('ne désigne aucune prochaine échéance quand tout est réglé', () => {
    const echeancier = inFine([EcheanceStatus.PAYE, EcheanceStatus.PAYE]);

    expect(echeancier.prochaineEcheance).toBeNull();
    expect(echeancier.estIntegralementRembourse).toBe(true);
  });

  it('ne tient pas un échéancier vide pour remboursé', () => {
    const echeancier = RepaymentSchedule.reconstituer(INVESTISSEMENT, []);

    expect(echeancier.estIntegralementRembourse).toBe(false);
  });

  it('ne tient pas pour remboursé un échéancier dont une échéance est en défaut', () => {
    const echeancier = inFine([EcheanceStatus.PAYE, EcheanceStatus.DEFAUT]);

    expect(echeancier.estIntegralementRembourse).toBe(false);
  });
});
