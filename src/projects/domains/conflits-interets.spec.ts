import {
  LienAvecPrestataire,
  estPorteurDuProjet,
  verifierEligibiliteInvestisseur,
  verifierEligibilitePorteur,
  verifierInvestisseurNonPorteur,
  verifierPorteurSansPartsDeLaSocieteSupport,
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

describe('estPorteurDuProjet — décision D5', () => {
  it('reconnaît le porteur du projet visé', () => {
    expect(estPorteurDuProjet(42, 42)).toBe(true);
  });

  it("ne reconnaît pas le porteur d'un AUTRE projet", () => {
    expect(estPorteurDuProjet(42, 7)).toBe(false);
  });

  it('un projet sans porteur identifié n’exclut personne', () => {
    // Offre montée par la plateforme : `porteurId` nul. Sans ce cas, un
    // `null === null` mal écrit aurait exclu tout le monde de ces projets.
    expect(estPorteurDuProjet(42, null)).toBe(false);
    expect(estPorteurDuProjet(42, undefined)).toBe(false);
  });
});

describe('verifierInvestisseurNonPorteur — décision D5', () => {
  it('refuse le porteur du projet, motif explicite', () => {
    const verdict = verifierInvestisseurNonPorteur(42, 42);
    expect(verdict.autorise).toBe(false);
    expect(verdict.motif).toContain('Vous portez ce projet');
    // Le motif couvre les trois gestes interdits par la clause CGU.
    expect(verdict.motif).toContain('souscrire');
    expect(verdict.motif).toContain('réserver');
    expect(verdict.motif).toContain('marché secondaire');
  });

  it('CONTRE-ÉPREUVE : un porteur investit dans le projet d’un AUTRE porteur', () => {
    // La règle vise le porteur DE CE PROJET, jamais le rôle. Sans ce test,
    // une garde écrite « si l'utilisateur est porteur » passerait les autres.
    expect(verifierInvestisseurNonPorteur(42, 7).autorise).toBe(true);
  });

  it('CONTRE-ÉPREUVE : un investisseur ordinaire passe, projet porté ou non', () => {
    expect(verifierInvestisseurNonPorteur(99, 7).autorise).toBe(true);
    expect(verifierInvestisseurNonPorteur(99, null).autorise).toBe(true);
  });
});

describe('verifierPorteurSansPartsDeLaSocieteSupport — D5, sens inverse', () => {
  it('refuse le candidat qui détient déjà des parts de la société support', () => {
    const verdict = verifierPorteurSansPartsDeLaSocieteSupport(true);
    expect(verdict.autorise).toBe(false);
    expect(verdict.motif).toContain('société support');
  });

  it('CONTRE-ÉPREUVE : sans détention, le rattachement est autorisé', () => {
    expect(verifierPorteurSansPartsDeLaSocieteSupport(false).autorise).toBe(
      true,
    );
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
