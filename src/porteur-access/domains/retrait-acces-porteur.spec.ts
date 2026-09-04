import {
  AccesPorteurEtatInchangeError,
  MotifRetraitRequisError,
} from './errors/porteur-access.errors';
import {
  LIBELLES_MOTIF_RETRAIT,
  MotifRetraitAccesPorteur,
  estMotifRetraitConnu,
  libelleMotifRetrait,
} from './motif-retrait';
import {
  accesRevoqueLeApresDecision,
  acterAccesPorteur,
} from './retrait-acces-porteur';

/**
 * Cycle de vie du drapeau d'accès porteur — domaine pur, aucune base, aucun
 * réseau. La clause CGU exige un retrait MOTIVÉ, NOTIFIÉ et RÉVERSIBLE : les
 * deux premiers points se jouent ici (le troisième aussi, par le ré-octroi).
 */

const T0 = new Date('2026-09-04T10:00:00.000Z');
const OUVERT = { porteurAccess: true, accesRevoqueLe: null };
const FERME = { porteurAccess: false, accesRevoqueLe: null };

describe('Retrait de l’accès porteur', () => {
  it('referme le drapeau et HORODATE le retrait', () => {
    const acte = acterAccesPorteur({
      courant: OUVERT,
      acces: false,
      motif: MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL,
      maintenant: T0,
    });

    expect(acte.etat).toEqual({ porteurAccess: false, accesRevoqueLe: T0 });
    expect(acte.motifRetrait).toBe(
      MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL,
    );
    expect(acte.estUnRetrait).toBe(true);
  });

  it.each([undefined, null, '', 'parce que non', 42, 'MANQUEMENT_CONTRACTUEL'])(
    'refuse le motif %p (400) — la mesure doit être MOTIVÉE',
    (motif) => {
      expect(() =>
        acterAccesPorteur({ courant: OUVERT, acces: false, motif }),
      ).toThrow(MotifRetraitRequisError);
    },
  );

  it('accepte les cinq codes de la liste fermée', () => {
    for (const motif of Object.values(MotifRetraitAccesPorteur)) {
      expect(
        acterAccesPorteur({ courant: OUVERT, acces: false, motif })
          .motifRetrait,
      ).toBe(motif);
    }
  });
});

describe('Ré-octroi (réversibilité exigée par les CGU)', () => {
  it('rouvre le drapeau et EFFACE l’horodatage de retrait', () => {
    const acte = acterAccesPorteur({
      courant: { porteurAccess: false, accesRevoqueLe: T0 },
      acces: true,
      maintenant: new Date('2026-10-01T00:00:00.000Z'),
    });

    // L'invariant « accès ouvert ⟹ pas de date de retrait » : sans cet
    // effacement, la purge RGPD lirait une fin d'accès sur un accès qui court.
    expect(acte.etat).toEqual({ porteurAccess: true, accesRevoqueLe: null });
    expect(acte.motifRetrait).toBeNull();
    expect(acte.estUnRetrait).toBe(false);
  });

  it('n’exige AUCUN motif', () => {
    expect(() =>
      acterAccesPorteur({ courant: FERME, acces: true }),
    ).not.toThrow();
  });
});

describe('No-op refusé (409)', () => {
  it('retirer un accès déjà fermé', () => {
    expect(() =>
      acterAccesPorteur({
        courant: FERME,
        acces: false,
        motif: MotifRetraitAccesPorteur.OCTROI_ERRONE,
      }),
    ).toThrow(AccesPorteurEtatInchangeError);
  });

  it('rouvrir un accès déjà ouvert', () => {
    expect(() => acterAccesPorteur({ courant: OUVERT, acces: true })).toThrow(
      AccesPorteurEtatInchangeError,
    );
  });

  it('le no-op prime sur le motif manquant', () => {
    // Ordre voulu : inutile d'envoyer l'instructeur chercher un motif pour un
    // dossier qui n'a pas besoin d'être touché.
    let capturee: unknown;
    try {
      acterAccesPorteur({ courant: FERME, acces: false });
    } catch (erreur) {
      capturee = erreur;
    }
    expect(capturee).toBeInstanceOf(AccesPorteurEtatInchangeError);
  });

  it('porte un code stable et l’état courant', () => {
    try {
      acterAccesPorteur({ courant: OUVERT, acces: true });
    } catch (erreur) {
      const e = erreur as AccesPorteurEtatInchangeError;
      expect(e.code).toBe('PORTEUR_ACCESS_ETAT_INCHANGE');
      expect(e.details).toEqual({ porteurAccess: true });
    }
    expect.assertions(2);
  });
});

describe('Horodatage après une DÉCISION sur une demande', () => {
  it('une acceptation efface la date : l’accès court', () => {
    expect(
      accesRevoqueLeApresDecision(
        { porteurAccess: false, accesRevoqueLe: new Date('2025-01-01') },
        true,
        T0,
      ),
    ).toBeNull();
  });

  it('un refus qui REFERME un accès ouvert horodate le retrait', () => {
    expect(accesRevoqueLeApresDecision(OUVERT, false, T0)).toEqual(T0);
  });

  it('un refus sur un compte sans accès ne réécrit PAS un retrait antérieur', () => {
    // Sans cette règle, chaque nouveau refus repousserait le point de départ
    // du barème de conservation d'une vieille demande acceptée.
    const ancien = new Date('2025-03-01T00:00:00.000Z');
    expect(
      accesRevoqueLeApresDecision(
        { porteurAccess: false, accesRevoqueLe: ancien },
        false,
        T0,
      ),
    ).toEqual(ancien);
  });

  it('et laisse null quand rien n’a jamais été ouvert', () => {
    expect(accesRevoqueLeApresDecision(FERME, false, T0)).toBeNull();
  });
});

describe('Liste fermée des motifs de retrait', () => {
  it('chaque code a un libellé opposable, non vide', () => {
    for (const motif of Object.values(MotifRetraitAccesPorteur)) {
      expect(libelleMotifRetrait(motif)).toEqual(expect.any(String));
      expect(libelleMotifRetrait(motif).length).toBeGreaterThan(10);
    }
  });

  it('la table des libellés couvre EXACTEMENT l’énumération', () => {
    expect(Object.keys(LIBELLES_MOTIF_RETRAIT).sort()).toEqual(
      Object.values(MotifRetraitAccesPorteur).sort(),
    );
  });

  it.each(['', null, undefined, 42, 'OCTROI_ERRONE', 'hors_criteres'])(
    'rejette %p comme motif de retrait',
    (valeur) => {
      expect(estMotifRetraitConnu(valeur)).toBe(false);
    },
  );
});
