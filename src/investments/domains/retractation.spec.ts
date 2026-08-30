import { InvestmentStatus } from './enums/investment-status.enum';
import {
  CODE_RETRACTATION_DELAI_EXPIRE,
  CODE_RETRACTATION_NON_APPLICABLE,
  CODE_RETRACTATION_STATUT_INCOMPATIBLE,
  DELAI_RETRACTATION_JOURS,
  LIBELLE_DELAI_RETRACTATION,
  calculerEcheanceRetractation,
  retractationOuverte,
  tempsRestantRetractation,
  verifierEligibiliteRetractation,
} from './retractation';

const JOUR_MS = 24 * 3600 * 1000;

/**
 * Le délai de rétractation est une règle propre à BeOwn, dont la DURÉE n'a
 * qu'une seule expression dans le dépôt : `DELAI_RETRACTATION_JOURS`. Ces tests
 * n'écrivent jamais « 4 » : ils vérifient que tout dérive bien de la constante,
 * de sorte qu'ils restent verts le jour où elle change.
 */
describe("retractation — la durée dérive d'une source unique", () => {
  it('pose une échéance à exactement DELAI_RETRACTATION_JOURS de la souscription', () => {
    const souscritLe = new Date('2026-03-01T10:00:00.000Z');
    const attendu = new Date(souscritLe.getTime());
    attendu.setDate(attendu.getDate() + DELAI_RETRACTATION_JOURS);

    expect(calculerEcheanceRetractation(souscritLe).toISOString()).toBe(
      attendu.toISOString(),
    );
  });

  it('ne mute pas la date fournie', () => {
    const souscritLe = new Date('2026-03-01T10:00:00.000Z');
    calculerEcheanceRetractation(souscritLe);
    expect(souscritLe.toISOString()).toBe('2026-03-01T10:00:00.000Z');
  });

  it('compte des jours CALENDAIRES : franchit un week-end sans le sauter', () => {
    // 2026-03-06 est un vendredi.
    const vendredi = new Date('2026-03-06T12:00:00.000Z');
    const echeance = calculerEcheanceRetractation(vendredi);
    const ecartJours = Math.round(
      (echeance.getTime() - vendredi.getTime()) / JOUR_MS,
    );
    expect(ecartJours).toBe(DELAI_RETRACTATION_JOURS);
  });

  it('le libellé servi aux investisseurs se compose depuis la constante', () => {
    expect(LIBELLE_DELAI_RETRACTATION).toMatch(/jours? calendaires?$/);
    // Aucun chiffre figé : la durée est écrite en toutes lettres.
    expect(LIBELLE_DELAI_RETRACTATION).not.toMatch(/\d/);
  });
});

describe('retractationOuverte / tempsRestantRetractation', () => {
  const maintenant = new Date('2026-03-01T10:00:00.000Z');

  it('ouverte tant que maintenant <= échéance, bornes incluses', () => {
    expect(retractationOuverte(new Date(maintenant), maintenant)).toBe(true);
    expect(
      retractationOuverte(new Date(maintenant.getTime() + 1), maintenant),
    ).toBe(true);
    expect(
      retractationOuverte(new Date(maintenant.getTime() - 1), maintenant),
    ).toBe(false);
  });

  it("fermée en l'absence d'échéance (investisseur averti)", () => {
    expect(retractationOuverte(null, maintenant)).toBe(false);
    expect(tempsRestantRetractation(null, maintenant)).toBe(0);
  });

  it('ne renvoie jamais un temps restant négatif', () => {
    expect(
      tempsRestantRetractation(
        new Date(maintenant.getTime() - JOUR_MS),
        maintenant,
      ),
    ).toBe(0);
  });
});

describe('verifierEligibiliteRetractation — codes de refus stables', () => {
  const maintenant = new Date('2026-03-01T10:00:00.000Z');
  const echeanceOuverte = new Date(maintenant.getTime() + JOUR_MS);

  it('autorise une souscription sous délai et renvoie son échéance', () => {
    const verdict = verifierEligibiliteRetractation({
      statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      echeance: echeanceOuverte,
      maintenant,
    });

    expect(verdict).toEqual({
      autorisee: true,
      code: null,
      motif: null,
      expireLe: echeanceOuverte,
    });
  });

  it.each([
    InvestmentStatus.CONFIRME,
    InvestmentStatus.RETRACTE,
    InvestmentStatus.ANNULE,
    InvestmentStatus.PAIEMENT_ATTENDU,
    InvestmentStatus.REMBOURSE_TOTAL,
  ])('refuse le statut %s avec STATUT_INCOMPATIBLE', (statut) => {
    const verdict = verifierEligibiliteRetractation({
      statut,
      echeance: echeanceOuverte,
      maintenant,
    });

    expect(verdict.autorisee).toBe(false);
    expect(verdict.code).toBe(CODE_RETRACTATION_STATUT_INCOMPATIBLE);
    expect(verdict.motif).toContain(statut);
  });

  it('refuse une souscription sans échéance (investisseur averti)', () => {
    const verdict = verifierEligibiliteRetractation({
      statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      echeance: null,
      maintenant,
    });

    expect(verdict.code).toBe(CODE_RETRACTATION_NON_APPLICABLE);
    expect(verdict.expireLe).toBeNull();
    expect(verdict.motif).toContain('non avertis');
  });

  it("refuse un délai expiré, et rend l'échéance pour que le front l'affiche", () => {
    const expiree = new Date(maintenant.getTime() - 1);
    const verdict = verifierEligibiliteRetractation({
      statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      echeance: expiree,
      maintenant,
    });

    expect(verdict.code).toBe(CODE_RETRACTATION_DELAI_EXPIRE);
    expect(verdict.expireLe?.toISOString()).toBe(expiree.toISOString());
    // Le message reprend le libellé unique, jamais une durée réécrite.
    expect(verdict.motif).toContain(LIBELLE_DELAI_RETRACTATION);
  });

  it("le statut prime sur l'expiration : ordre d'évaluation stable", () => {
    const verdict = verifierEligibiliteRetractation({
      statut: InvestmentStatus.CONFIRME,
      echeance: new Date(maintenant.getTime() - JOUR_MS),
      maintenant,
    });
    expect(verdict.code).toBe(CODE_RETRACTATION_STATUT_INCOMPATIBLE);
  });

  it("aucun message de refus ne cite de règlement ni d'autorité", () => {
    const motifs = [
      verifierEligibiliteRetractation({
        statut: InvestmentStatus.CONFIRME,
        echeance: echeanceOuverte,
        maintenant,
      }).motif,
      verifierEligibiliteRetractation({
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
        echeance: null,
        maintenant,
      }).motif,
      verifierEligibiliteRetractation({
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
        echeance: new Date(maintenant.getTime() - 1),
        maintenant,
      }).motif,
    ];

    for (const motif of motifs) {
      expect(motif).not.toMatch(
        /2020\/1503|ECSP|PSFP|AMF|AEMF|règlement \(UE\)|art\. ?2[0-9]/i,
      );
    }
  });
});
