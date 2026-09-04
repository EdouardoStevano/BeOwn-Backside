import {
  chercherCorrespondances,
  estCorrespondance,
  normaliserDate,
  normaliserNom,
} from './sanctions-screening';

/**
 * Domaine PUR — aucune base, aucun réseau, aucun framework.
 * Règle : correspondance si nom identique ET (prénom identique OU date de
 * naissance identique), après normalisation casse/accents.
 */
describe('sanctions-screening (domaine pur)', () => {
  describe('normaliserNom', () => {
    it('neutralise casse, accents, tirets, apostrophes et espaces répétés', () => {
      expect(normaliserNom('Aïssatou  FALL')).toBe('aissatou fall');
      expect(normaliserNom('Jean-Pierre')).toBe('jean pierre');
      expect(normaliserNom("D'Almeida")).toBe('d almeida');
      expect(normaliserNom('  Éléonore   Nguyễn ')).toBe('eleonore nguyen');
    });

    it('rend une chaîne vide pour null/undefined/blanc', () => {
      expect(normaliserNom(null)).toBe('');
      expect(normaliserNom(undefined)).toBe('');
      expect(normaliserNom('   ')).toBe('');
    });
  });

  describe('normaliserDate', () => {
    it('accepte Date et chaîne ISO, rend yyyy-mm-dd', () => {
      expect(normaliserDate(new Date('1985-04-12T00:00:00Z'))).toBe('1985-04-12');
      expect(normaliserDate('1985-04-12')).toBe('1985-04-12');
      expect(normaliserDate('1985-04-12T10:30:00Z')).toBe('1985-04-12');
    });

    it('rend null pour une valeur absente ou inexploitable', () => {
      expect(normaliserDate(null)).toBeNull();
      expect(normaliserDate(undefined)).toBeNull();
      expect(normaliserDate('12/04/1985')).toBeNull();
      expect(normaliserDate(new Date('invalide'))).toBeNull();
    });
  });

  describe('estCorrespondance', () => {
    const personne = {
      nom: 'Fall',
      prenom: 'Aïssatou',
      dateNaissance: '1985-04-12',
    };

    it('matche sur nom + prénom exacts, indifférent à la casse et aux accents', () => {
      expect(
        estCorrespondance(
          { nom: 'FALL', prenom: 'aissatou', dateNaissance: null },
          personne,
        ),
      ).toBe(true);
    });

    it('matche sur nom + date de naissance quand le prénom diffère', () => {
      expect(
        estCorrespondance(
          { nom: 'Fall', prenom: 'Binta', dateNaissance: '1985-04-12' },
          personne,
        ),
      ).toBe(true);
    });

    it('ne matche PAS sur le prénom seul (nom différent)', () => {
      expect(
        estCorrespondance(
          { nom: 'Diop', prenom: 'Aïssatou', dateNaissance: null },
          personne,
        ),
      ).toBe(false);
    });

    it('ne matche PAS sur nom seul quand prénom et date diffèrent', () => {
      expect(
        estCorrespondance(
          { nom: 'Fall', prenom: 'Binta', dateNaissance: '1990-01-01' },
          personne,
        ),
      ).toBe(false);
    });

    it('ne matche PAS nom+date quand la liste ne porte pas de date', () => {
      expect(
        estCorrespondance(
          { nom: 'Fall', prenom: 'Binta', dateNaissance: '1985-04-12' },
          { ...personne, dateNaissance: null },
        ),
      ).toBe(false);
    });

    it('un nom vide ne matche jamais (pas de déclenchement sur du bruit)', () => {
      expect(
        estCorrespondance(
          { nom: '', prenom: 'Aïssatou', dateNaissance: '1985-04-12' },
          personne,
        ),
      ).toBe(false);
      expect(
        estCorrespondance(
          { nom: 'Fall', prenom: 'Aïssatou', dateNaissance: null },
          { nom: '  ', prenom: 'Aïssatou', dateNaissance: null },
        ),
      ).toBe(false);
    });
  });

  describe('chercherCorrespondances', () => {
    const liste = [
      { id: 'p1', nom: 'Fall', prenom: 'Aïssatou', dateNaissance: '1985-04-12' },
      { id: 'p2', nom: 'Diop', prenom: 'Moussa', dateNaissance: null },
      { id: 'p3', nom: 'Fall', prenom: 'Binta', dateNaissance: null },
    ];

    it('rend toutes les personnes correspondantes, et elles seules', () => {
      const resultat = chercherCorrespondances(
        { nom: 'FALL', prenom: 'aïssatou', dateNaissance: null },
        liste,
      );
      expect(resultat.map((p) => p.id)).toEqual(['p1']);
    });

    it('rend un tableau vide sans correspondance', () => {
      expect(
        chercherCorrespondances(
          { nom: 'Ndiaye', prenom: 'Fatou', dateNaissance: '2000-01-01' },
          liste,
        ),
      ).toEqual([]);
    });
  });
});
