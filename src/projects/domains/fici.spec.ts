import {
  AVERTISSEMENTS,
  AVERTISSEMENT_ABSENCE_GARANTIE,
  AVERTISSEMENT_LIMINAIRE,
  INTITULES_SECTIONS,
  MARQUEUR_RESPONSABILITE_ASSOCIES,
  MENTION_ABSENCE_CONSEIL,
  MENTION_DELAI_REFLEXION,
  MENTION_RESPONSABILITE_CONTENU,
  NOMBRE_MAX_PAGES,
  SECTIONS_REQUISES,
  SectionFici,
  decrireVerdict,
  rendreSections,
  verifierFici,
} from './fici';

const documentComplet = () => ({
  sections: Object.fromEntries(
    SECTIONS_REQUISES.map((section) => [
      section,
      'Contenu rédigé par le porteur.',
    ]),
  ) as Record<SectionFici, string>,
  nombrePages: 5,
  langue: 'fr',
});

describe("verifierFici — complétude du document d'informations clés", () => {
  it('valide un document complet', () => {
    const verdict = verifierFici(documentComplet());
    expect(verdict.valide).toBe(true);
    expect(verdict.sectionsManquantes).toEqual([]);
    expect(verdict.anomalies).toEqual([]);
  });

  it('signale chaque section absente', () => {
    const contenu = documentComplet();
    delete (contenu.sections as Partial<Record<SectionFici, string>>)[
      SectionFici.FACTEURS_DE_RISQUE
    ];
    const verdict = verifierFici(contenu);

    expect(verdict.valide).toBe(false);
    expect(verdict.sectionsManquantes).toEqual([
      SectionFici.FACTEURS_DE_RISQUE,
    ]);
  });

  it('traite une section vide ou blanche comme manquante', () => {
    const contenu = documentComplet();
    contenu.sections[SectionFici.DROITS_ET_RECOURS] = '   ';
    expect(verifierFici(contenu).sectionsManquantes).toEqual([
      SectionFici.DROITS_ET_RECOURS,
    ]);
  });

  it('refuse un document de plus de six pages, sans invoquer aucune règle externe', () => {
    const verdict = verifierFici({
      ...documentComplet(),
      nombrePages: NOMBRE_MAX_PAGES + 1,
    });
    expect(verdict.valide).toBe(false);
    expect(verdict.anomalies[0]).toBe(
      'Le document compte 7 pages : la limite éditoriale est de 6 pages A4, annexes exclues.',
    );
  });

  it('accepte exactement six pages', () => {
    expect(
      verifierFici({ ...documentComplet(), nombrePages: NOMBRE_MAX_PAGES })
        .valide,
    ).toBe(true);
  });

  it("refuse un document rédigé dans une autre langue que celle de l'opération", () => {
    const verdict = verifierFici({ ...documentComplet(), langue: 'en' }, 'fr');
    expect(verdict.valide).toBe(false);
    expect(verdict.anomalies[0]).toBe(
      "Le document est rédigé en « en » alors que l'opération est présentée en « fr ».",
    );
  });

  it("exige les huit sections du gabarit, dans l'ordre", () => {
    expect(SECTIONS_REQUISES).toEqual([
      SectionFici.PORTEUR_ET_OPERATION,
      SectionFici.BIEN_ET_OPERATION,
      SectionFici.SOCIETE_SUPPORT,
      SectionFici.CONDITIONS_SOUSCRIPTION,
      SectionFici.REVENUS_ET_SORTIE,
      SectionFici.FACTEURS_DE_RISQUE,
      SectionFici.FRAIS,
      SectionFici.DROITS_ET_RECOURS,
    ]);
    expect(verifierFici({ sections: {} }).sectionsManquantes).toHaveLength(8);
  });

  it('porte les intitulés exacts du gabarit', () => {
    expect(Object.values(INTITULES_SECTIONS)).toEqual([
      "1 — Qui porte l'opération",
      "2 — Le bien immobilier et l'opération",
      '3 — La société support et vos parts',
      '4 — Conditions de la souscription',
      '5 — Revenus attendus et sortie',
      "6 — Facteurs de risque propres à l'opération",
      '7 — Frais',
      '8 — Vos droits et vos recours',
    ]);
  });

  it('ne bloque pas sur le marqueur de responsabilité des associés (question de droit, pas de contrôle automatique)', () => {
    const contenu = documentComplet();
    contenu.sections[SectionFici.SOCIETE_SUPPORT] =
      MARQUEUR_RESPONSABILITE_ASSOCIES;
    expect(verifierFici(contenu).valide).toBe(true);
  });
});

describe('decrireVerdict', () => {
  it('énumère les sections incomplètes en clair', () => {
    const message = decrireVerdict(verifierFici({ sections: {} }));
    expect(message).toContain(
      "Sections incomplètes dans le document d'informations clés :",
    );
    expect(message).toContain("6 — Facteurs de risque propres à l'opération");
    expect(message).toContain('8 — Vos droits et vos recours');
  });

  it('concatène anomalies et sections incomplètes', () => {
    const message = decrireVerdict(
      verifierFici({ sections: {}, nombrePages: 12, langue: 'en' }),
    );
    expect(message).toContain('Le document compte 12 pages');
    expect(message).toContain('rédigé en « en »');
  });
});

describe('rendreSections', () => {
  it("projette les huit sections dans l'ordre, avec intitulé, rang et aide à la saisie", () => {
    const rendues = rendreSections(null);
    expect(rendues).toHaveLength(8);
    expect(rendues.map((s) => s.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rendues[0].cle).toBe(SectionFici.PORTEUR_ET_OPERATION);
    expect(rendues[0].intitule).toBe("1 — Qui porte l'opération");
    expect(rendues[0].aide.length).toBeGreaterThan(0);
    expect(rendues.every((s) => s.contenu === null)).toBe(true);
  });

  it('reporte le contenu saisi et normalise une section blanche à null', () => {
    const rendues = rendreSections({
      sections: {
        [SectionFici.FRAIS]: '7 % des loyers encaissés.',
        [SectionFici.PORTEUR_ET_OPERATION]: '   ',
      },
    });
    const frais = rendues.find((s) => s.cle === SectionFici.FRAIS);
    const porteur = rendues.find(
      (s) => s.cle === SectionFici.PORTEUR_ET_OPERATION,
    );
    expect(frais?.contenu).toBe('7 % des loyers encaissés.');
    expect(porteur?.contenu).toBeNull();
  });

  it("sert l'aide de la section 3 avec le marqueur à compléter", () => {
    const societe = rendreSections(null).find(
      (s) => s.cle === SectionFici.SOCIETE_SUPPORT,
    );
    expect(societe?.aide.join(' ')).toContain(MARQUEUR_RESPONSABILITE_ASSOCIES);
  });
});

describe('avertissements — textes du gabarit, mot pour mot', () => {
  it('avertissement liminaire : aucune autorité nommée, aucun régime revendiqué', () => {
    expect(AVERTISSEMENT_LIMINAIRE).toBe(
      "Ce document est établi par le porteur de l'opération et publié par BeOwn. " +
        "Il n'a été vérifié ni approuvé par aucune autorité publique. BeOwn ne " +
        "détient à ce jour aucun agrément d'autorité de marché. En souscrivant, " +
        "vous assumez l'intégralité du risque de l'opération, y compris le risque " +
        'de perte partielle ou totale des sommes investies.',
    );
  });

  it('absence de garantie : formulation identique à celle des mentions légales', () => {
    expect(AVERTISSEMENT_ABSENCE_GARANTIE).toBe(
      "Les sommes investies ne bénéficient d'aucune garantie publique, d'aucun " +
        "fonds d'indemnisation des investisseurs et d'aucune garantie des dépôts.",
    );
  });

  it('délai de réflexion : annoncé comme un engagement de la plateforme', () => {
    expect(MENTION_DELAI_REFLEXION).toContain(
      'délai de réflexion de quatre jours calendaires',
    );
    expect(MENTION_DELAI_REFLEXION).toContain('questionnaire de la plateforme');
  });

  it('absence de conseil et responsabilité du contenu sont servies', () => {
    expect(MENTION_ABSENCE_CONSEIL).toContain(
      'aucun conseil en investissement',
    );
    expect(MENTION_RESPONSABILITE_CONTENU).toContain(
      'sous la responsabilité du porteur',
    );
  });

  it('le bloc servi aux interfaces porte les cinq avertissements', () => {
    expect(Object.keys(AVERTISSEMENTS)).toEqual([
      'liminaire',
      'absenceGarantie',
      'absenceConseil',
      'delaiReflexion',
      'responsabiliteContenu',
    ]);
  });

  it("aucun texte servi ne nomme d'autorité ni de règlement dont BeOwn ne relève pas", () => {
    const interdits =
      /AMF|AEMF|PSFP|2020\/1503|2022\/2119|2014\/49|97\/9|financement participatif|art\. 2[0-9]/i;
    const textes = [
      ...Object.values(AVERTISSEMENTS),
      ...Object.values(INTITULES_SECTIONS),
      decrireVerdict(
        verifierFici({ sections: {}, nombrePages: 9, langue: 'en' }),
      ),
    ];
    for (const texte of textes) {
      expect(texte).not.toMatch(interdits);
    }
  });
});
