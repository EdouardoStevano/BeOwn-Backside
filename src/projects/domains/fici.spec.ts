import {
  AVERTISSEMENT_ABSENCE_GARANTIE,
  AVERTISSEMENT_LIMINAIRE,
  NOMBRE_MAX_PAGES,
  SECTIONS_REQUISES,
  SectionFici,
  decrireVerdict,
  verifierFici,
} from './fici';

const ficiComplete = () => ({
  sections: Object.fromEntries(
    SECTIONS_REQUISES.map((section) => [section, 'Contenu rédigé par le porteur.']),
  ) as Record<SectionFici, string>,
  nombrePages: 5,
  langue: 'fr',
});

describe('verifierFici — art. 23 et RTS 2022/2119', () => {
  it('valide une fiche complète', () => {
    const verdict = verifierFici(ficiComplete());
    expect(verdict.valide).toBe(true);
    expect(verdict.sectionsManquantes).toEqual([]);
    expect(verdict.anomalies).toEqual([]);
  });

  it('signale chaque section absente', () => {
    const contenu = ficiComplete();
    delete (contenu.sections as Partial<Record<SectionFici, string>>)[
      SectionFici.FACTEURS_DE_RISQUE
    ];
    const verdict = verifierFici(contenu);

    expect(verdict.valide).toBe(false);
    expect(verdict.sectionsManquantes).toEqual([SectionFici.FACTEURS_DE_RISQUE]);
  });

  it('traite une section vide ou blanche comme manquante', () => {
    const contenu = ficiComplete();
    contenu.sections[SectionFici.DROITS_DES_INVESTISSEURS] = '   ';
    expect(verifierFici(contenu).sectionsManquantes).toEqual([
      SectionFici.DROITS_DES_INVESTISSEURS,
    ]);
  });

  it('refuse une fiche de plus de six pages', () => {
    const verdict = verifierFici({ ...ficiComplete(), nombrePages: NOMBRE_MAX_PAGES + 1 });
    expect(verdict.valide).toBe(false);
    expect(verdict.anomalies[0]).toContain('6 pages');
  });

  it('accepte exactement six pages', () => {
    expect(verifierFici({ ...ficiComplete(), nombrePages: NOMBRE_MAX_PAGES }).valide).toBe(
      true,
    );
  });

  it('refuse une fiche rédigée dans une autre langue que celle de commercialisation', () => {
    const verdict = verifierFici({ ...ficiComplete(), langue: 'en' }, 'fr');
    expect(verdict.valide).toBe(false);
    expect(verdict.anomalies[0]).toContain('en');
  });

  it('exige les sept sections de l\'annexe I retenues', () => {
    expect(SECTIONS_REQUISES).toHaveLength(7);
    const verdict = verifierFici({ sections: {} });
    expect(verdict.sectionsManquantes).toHaveLength(7);
  });
});

describe('decrireVerdict', () => {
  it('énumère les sections manquantes en clair', () => {
    const message = decrireVerdict(verifierFici({ sections: {} }));
    expect(message).toContain('Facteurs de risque');
    expect(message).toContain('Droits des investisseurs');
  });
});

describe('avertissements de texte imposé', () => {
  it('reprend la mention d\'absence de vérification par l\'AMF et l\'AEMF', () => {
    expect(AVERTISSEMENT_LIMINAIRE).toContain('ni vérifiée ni approuvée');
    expect(AVERTISSEMENT_LIMINAIRE).toContain('AEMF');
    expect(AVERTISSEMENT_LIMINAIRE).toContain('perte partielle ou totale');
  });

  it('reprend la mention d\'absence de garantie des dépôts et d\'indemnisation', () => {
    expect(AVERTISSEMENT_ABSENCE_GARANTIE).toContain('2014/49/UE');
    expect(AVERTISSEMENT_ABSENCE_GARANTIE).toContain('97/9/CE');
  });
});
