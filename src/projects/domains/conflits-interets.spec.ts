import {
  LienAvecPrestataire,
  verifierEligibiliteInvestisseur,
  verifierEligibilitePorteur,
} from './conflits-interets';

describe('verifierEligibilitePorteur — art. 8(2)', () => {
  it('autorise un porteur sans lien avec le prestataire', () => {
    expect(
      verifierEligibilitePorteur({ lien: LienAvecPrestataire.AUCUN }).autorise,
    ).toBe(true);
  });

  it('refuse un dirigeant, un salarié et une personne liée', () => {
    for (const lien of [
      LienAvecPrestataire.DIRIGEANT,
      LienAvecPrestataire.SALARIE,
      LienAvecPrestataire.PERSONNE_LIEE,
    ]) {
      const verdict = verifierEligibilitePorteur({ lien });
      expect(verdict.autorise).toBe(false);
      expect(verdict.motif).toContain('Art. 8(2)');
    }
  });

  it('refuse un actionnaire à partir de 20 %, autorise en deçà', () => {
    expect(
      verifierEligibilitePorteur({
        lien: LienAvecPrestataire.ACTIONNAIRE,
        participation: 0.2,
      }).autorise,
    ).toBe(false);

    expect(
      verifierEligibilitePorteur({
        lien: LienAvecPrestataire.ACTIONNAIRE,
        participation: 0.1999,
      }).autorise,
    ).toBe(true);
  });

  it('traite un actionnaire sans participation déclarée comme non qualifié', () => {
    expect(
      verifierEligibilitePorteur({ lien: LienAvecPrestataire.ACTIONNAIRE }).autorise,
    ).toBe(true);
  });

  it('refuse le prestataire lui-même, quel que soit le lien déclaré', () => {
    const verdict = verifierEligibilitePorteur({
      lien: LienAvecPrestataire.AUCUN,
      estLePrestataire: true,
    });
    expect(verdict.autorise).toBe(false);
    expect(verdict.motif).toContain('Art. 8(1)');
  });
});

describe('verifierEligibiliteInvestisseur — art. 8(1)', () => {
  it('autorise un investisseur tiers', () => {
    expect(verifierEligibiliteInvestisseur(false).autorise).toBe(true);
  });

  it('refuse le prestataire sur ses propres offres', () => {
    const verdict = verifierEligibiliteInvestisseur(true);
    expect(verdict.autorise).toBe(false);
    expect(verdict.motif).toContain('Art. 8(1)');
  });
});
