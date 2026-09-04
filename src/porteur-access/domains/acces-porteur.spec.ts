import { UserRole } from 'src/iam/domains/enums/user.enum';
import {
  peutAccederEspacePorteur,
  peutDemanderAccesPorteur,
} from './acces-porteur';
import {
  LIBELLES_MOTIF_REFUS,
  MotifRefusAccesPorteur,
  estMotifRefusConnu,
  libelleMotifRefus,
} from './motif-refus';

/**
 * Règle du double accès (décision fondateur D1) et liste fermée des motifs.
 * Domaine pur : aucune base, aucun réseau.
 */

describe('Double accès à l’espace porteur (D1)', () => {
  it('un porteur « pur » entre, drapeau ou pas', () => {
    expect(peutAccederEspacePorteur(UserRole.PORTEUR, false)).toBe(true);
    expect(peutAccederEspacePorteur(UserRole.PORTEUR, true)).toBe(true);
  });

  it('un investisseur avec porteurAccess entre SANS changer de rôle', () => {
    // C'est tout le sens de D1 : le compte reste `investisseur`.
    expect(peutAccederEspacePorteur(UserRole.INVESTISSEUR, true)).toBe(true);
  });

  it('un investisseur sans le drapeau reste dehors', () => {
    expect(peutAccederEspacePorteur(UserRole.INVESTISSEUR, false)).toBe(false);
  });

  it.each([null, undefined])('un drapeau %s vaut « pas d’accès »', (valeur) => {
    expect(peutAccederEspacePorteur(UserRole.INVESTISSEUR, valeur)).toBe(false);
  });

  it.each([null, undefined, '', 'porteur_access'])(
    'un rôle %s ne suffit jamais',
    (role) => {
      expect(peutAccederEspacePorteur(role as string, false)).toBe(false);
    },
  );

  it('AUCUN rôle back-office n’ouvre l’espace porteur au passage', () => {
    // Le durcissement ne doit pas offrir l'espace porteur à l'administration :
    // gérer des baux et une trésorerie de projet n'est pas une tâche de
    // back-office.
    for (const role of [
      UserRole.SUPER_ADMIN,
      UserRole.COMPLIANCE,
      UserRole.FINANCIER,
      UserRole.CIO,
      UserRole.SUPPORT,
      UserRole.RCCI,
      UserRole.DPO,
      UserRole.MARKETING,
      UserRole.ANALYSTE_FINANCIER,
      UserRole.CHARGE_RELATION_INVESTISSEUR,
      UserRole.CGP,
    ]) {
      expect(peutAccederEspacePorteur(role, false)).toBe(false);
    }
  });
});

describe('Éligibilité à la DEMANDE', () => {
  it('seul un investisseur demande l’accès porteur', () => {
    expect(peutDemanderAccesPorteur(UserRole.INVESTISSEUR)).toBe(true);
  });

  it('un porteur « pur » n’a rien à demander', () => {
    expect(peutDemanderAccesPorteur(UserRole.PORTEUR)).toBe(false);
  });

  it('le back-office non plus', () => {
    for (const role of [
      UserRole.SUPER_ADMIN,
      UserRole.COMPLIANCE,
      UserRole.CGP,
    ]) {
      expect(peutDemanderAccesPorteur(role)).toBe(false);
    }
  });
});

describe('Liste fermée des motifs de refus', () => {
  it('chaque code a un libellé opposable, non vide', () => {
    for (const motif of Object.values(MotifRefusAccesPorteur)) {
      expect(libelleMotifRefus(motif)).toEqual(expect.any(String));
      expect(libelleMotifRefus(motif).length).toBeGreaterThan(10);
    }
  });

  it('la table des libellés couvre EXACTEMENT l’énumération', () => {
    expect(Object.keys(LIBELLES_MOTIF_REFUS).sort()).toEqual(
      Object.values(MotifRefusAccesPorteur).sort(),
    );
  });

  it.each(['parce que non', '', null, undefined, 42, 'IDENTITE_NON_VERIFIEE'])(
    'rejette %p comme motif',
    (valeur) => {
      expect(estMotifRefusConnu(valeur)).toBe(false);
    },
  );

  it('accepte les quatre codes de la liste', () => {
    for (const motif of Object.values(MotifRefusAccesPorteur)) {
      expect(estMotifRefusConnu(motif)).toBe(true);
    }
  });
});
