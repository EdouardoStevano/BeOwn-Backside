import {
  DELAI_CARENCE_APRES_REFUS_JOURS,
  DemandeAccesPorteur,
  MOTIVATION_LONGUEUR_MAX,
  MOTIVATION_LONGUEUR_MIN,
  SEUIL_ALERTE_INSTRUCTION_JOURS,
  STATUTS_NON_TERMINAUX,
  StatutDemandeAccesPorteur,
  TRANSITIONS_LEGALES,
  alerteInstructionLe,
  decisionEstImputable,
  echeanceReponseIndicative,
  estTerminal,
  finDeCarence,
  instructionEnAlerte,
  transitionAutorisee,
} from './demande-acces-porteur';
import { CGU_VERSION_COURANTE } from './cgu-version';
import { MotifRefusAccesPorteur } from './motif-refus';
import {
  DecideurNonImputableError,
  DemandeAccesPorteurEtrangereError,
  MotifRefusRequisError,
  MotivationInvalideError,
  TransitionDemandeInterditeError,
} from './errors/porteur-access.errors';

/**
 * Machine à états de la demande d'accès porteur — domaine PUR : aucun de ces
 * tests ne touche une base, un cache ou un réseau. Si l'un d'eux en avait
 * besoin, c'est l'architecture qu'il faudrait corriger.
 */

const USER = 42;
const ADMIN = 7;
const MOTIVATION = 'x'.repeat(MOTIVATION_LONGUEUR_MIN);
const T0 = new Date('2026-09-01T10:00:00.000Z');

const soumise = (maintenant: Date = T0) =>
  DemandeAccesPorteur.soumettre({
    utilisateurId: USER,
    motivation: MOTIVATION,
    maintenant,
  });

describe('Table des transitions', () => {
  it('les trois états de sortie sont terminaux, les deux autres non', () => {
    expect(estTerminal(StatutDemandeAccesPorteur.ACCEPTEE)).toBe(true);
    expect(estTerminal(StatutDemandeAccesPorteur.REFUSEE)).toBe(true);
    expect(estTerminal(StatutDemandeAccesPorteur.RETIREE)).toBe(true);
    expect(estTerminal(StatutDemandeAccesPorteur.SOUMISE)).toBe(false);
    expect(estTerminal(StatutDemandeAccesPorteur.EN_EXAMEN)).toBe(false);
  });

  it("`STATUTS_NON_TERMINAUX` est exactement l'ensemble des non-terminaux", () => {
    // Parité éprouvée et non supposée : cette liste alimente aussi la clause
    // `where` de l'index unique partiel en base. Une divergence rouvrirait le
    // doublon que l'index a pour mission d'interdire.
    const calcules = (
      Object.keys(TRANSITIONS_LEGALES) as StatutDemandeAccesPorteur[]
    ).filter((s) => !estTerminal(s));
    expect([...STATUTS_NON_TERMINAUX].sort()).toEqual(calcules.sort());
  });

  it("aucune transition ne part d'un état terminal", () => {
    for (const statut of [
      StatutDemandeAccesPorteur.ACCEPTEE,
      StatutDemandeAccesPorteur.REFUSEE,
      StatutDemandeAccesPorteur.RETIREE,
    ]) {
      for (const cible of Object.values(StatutDemandeAccesPorteur)) {
        expect(transitionAutorisee(statut, cible)).toBe(false);
      }
    }
  });

  it('une demande soumise ne peut pas « revenir » à soumise', () => {
    expect(
      transitionAutorisee(
        StatutDemandeAccesPorteur.SOUMISE,
        StatutDemandeAccesPorteur.SOUMISE,
      ),
    ).toBe(false);
  });
});

describe('Soumission', () => {
  it('naît soumise, sans décision ni décideur', () => {
    const demande = soumise();
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
    expect(demande.decideeLe).toBeNull();
    expect(demande.decideurAdminId).toBeNull();
    expect(demande.motifRefus).toBeNull();
    expect(demande.estEnCours()).toBe(true);
  });

  it('fige la version des CGU depuis la CONSTANTE SERVEUR', () => {
    // Le demandeur ne choisit pas ce qu'il est réputé avoir accepté : la
    // version n'est pas un paramètre de `soumettre`.
    expect(soumise().cguVersionAcceptee).toBe(CGU_VERSION_COURANTE);
  });

  it('normalise la motivation (espaces de bord)', () => {
    const demande = DemandeAccesPorteur.soumettre({
      utilisateurId: USER,
      motivation: `   ${MOTIVATION}   `,
    });
    expect(demande.motivation).toBe(MOTIVATION);
  });

  it.each([
    ['vide', ''],
    ['trop courte', 'x'.repeat(MOTIVATION_LONGUEUR_MIN - 1)],
    ['blanche', ' '.repeat(200)],
  ])('refuse une motivation %s', (_cas, motivation) => {
    expect(() =>
      DemandeAccesPorteur.soumettre({ utilisateurId: USER, motivation }),
    ).toThrow(MotivationInvalideError);
  });

  it('refuse au-delà du plafond DUR (jamais de troncature)', () => {
    expect(() =>
      DemandeAccesPorteur.soumettre({
        utilisateurId: USER,
        motivation: 'x'.repeat(MOTIVATION_LONGUEUR_MAX + 1),
      }),
    ).toThrow(MotivationInvalideError);
    // La borne elle-même passe.
    expect(
      DemandeAccesPorteur.soumettre({
        utilisateurId: USER,
        motivation: 'x'.repeat(MOTIVATION_LONGUEUR_MAX),
      }).motivation,
    ).toHaveLength(MOTIVATION_LONGUEUR_MAX);
  });
});

describe('Instruction', () => {
  it("soumise → en_examen nomme l'instructeur sans rien décider", () => {
    const demande = soumise();
    demande.prendreEnExamen(ADMIN);
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.EN_EXAMEN);
    expect(demande.decideurAdminId).toBe(ADMIN);
    // Instruire n'est pas décider : aucune date de décision n'est posée.
    expect(demande.decideeLe).toBeNull();
    expect(demande.estEnCours()).toBe(true);
  });

  it('reprendre en examen un dossier déjà décidé est interdit', () => {
    const demande = soumise();
    demande.accepter(ADMIN);
    expect(() => demande.prendreEnExamen(ADMIN)).toThrow(
      TransitionDemandeInterditeError,
    );
  });
});

describe('Acceptation', () => {
  it('depuis soumise comme depuis en_examen', () => {
    const directe = soumise();
    directe.accepter(ADMIN, T0);
    expect(directe.statut).toBe(StatutDemandeAccesPorteur.ACCEPTEE);

    const instruite = soumise();
    instruite.prendreEnExamen(ADMIN);
    instruite.accepter(ADMIN, T0);
    expect(instruite.statut).toBe(StatutDemandeAccesPorteur.ACCEPTEE);
    expect(instruite.decideeLe).toEqual(T0);
  });

  it('efface tout motif de refus résiduel', () => {
    const demande = soumise();
    demande.accepter(ADMIN);
    expect(demande.motifRefus).toBeNull();
    expect(demande.motifRefusComplement).toBeNull();
  });

  it('une demande acceptée ne peut plus être refusée', () => {
    const demande = soumise();
    demande.accepter(ADMIN);
    expect(() =>
      demande.refuser(ADMIN, MotifRefusAccesPorteur.HORS_CRITERES),
    ).toThrow(TransitionDemandeInterditeError);
  });
});

describe('Refus', () => {
  it('exige un motif CODÉ de la liste fermée', () => {
    const demande = soumise();
    demande.refuser(
      ADMIN,
      MotifRefusAccesPorteur.DOSSIER_INCOMPLET,
      '  Pièces manquantes  ',
      T0,
    );
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.REFUSEE);
    expect(demande.motifRefus).toBe(MotifRefusAccesPorteur.DOSSIER_INCOMPLET);
    expect(demande.motifRefusComplement).toBe('Pièces manquantes');
    expect(demande.decideeLe).toEqual(T0);
  });

  it.each([
    ['absent', undefined],
    ['nul', null],
    ['texte libre hors liste', 'parce que non'],
    ['vide', ''],
  ])('refuse un motif %s', (_cas, motif) => {
    const demande = soumise();
    expect(() => demande.refuser(ADMIN, motif)).toThrow(MotifRefusRequisError);
    // Contre-épreuve : la demande n'a pas bougé.
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
  });

  it("le complément est facultatif et normalisé à null s'il est blanc", () => {
    const demande = soumise();
    demande.refuser(ADMIN, MotifRefusAccesPorteur.HORS_CRITERES, '   ');
    expect(demande.motifRefusComplement).toBeNull();
  });

  it('borne la longueur du complément interne', () => {
    const demande = soumise();
    expect(() =>
      demande.refuser(
        ADMIN,
        MotifRefusAccesPorteur.HORS_CRITERES,
        'x'.repeat(1001),
      ),
    ).toThrow(MotifRefusRequisError);
  });

  it('« déjà décidée » prime sur « motif manquant »', () => {
    // L'ordre des contrôles est un choix : un instructeur qui rejoue un
    // dossier clos doit lire « transition interdite », pas « motif absent ».
    const demande = soumise();
    demande.accepter(ADMIN);
    expect(() => demande.refuser(ADMIN, undefined)).toThrow(
      TransitionDemandeInterditeError,
    );
  });
});

describe('Imputabilité de la décision (CGU : aucune décision automatisée)', () => {
  it.each([
    ['zéro', 0],
    ['négatif', -1],
    ['non entier', 1.5],
    ['NaN', Number.NaN],
  ])('refuse une acceptation par un décideur %s', (_cas, admin) => {
    const demande = soumise();
    expect(() => demande.accepter(admin)).toThrow(DecideurNonImputableError);
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
  });

  it('refuse un rejet sans décideur identifiable', () => {
    const demande = soumise();
    expect(() =>
      demande.refuser(0, MotifRefusAccesPorteur.HORS_CRITERES),
    ).toThrow(DecideurNonImputableError);
  });

  it('toute demande décidée porte un décideur', () => {
    const acceptee = soumise();
    acceptee.accepter(ADMIN);
    const refusee = soumise();
    refusee.refuser(ADMIN, MotifRefusAccesPorteur.HORS_CRITERES);

    expect(decisionEstImputable(acceptee.snapshot())).toBe(true);
    expect(decisionEstImputable(refusee.snapshot())).toBe(true);
    // Une demande non décidée n'a rien à imputer.
    expect(decisionEstImputable(soumise().snapshot())).toBe(true);
    // Contre-épreuve : un état décidé SANS décideur est bien détecté.
    expect(
      decisionEstImputable({
        statut: StatutDemandeAccesPorteur.ACCEPTEE,
        decideurAdminId: null,
      }),
    ).toBe(false);
  });
});

describe('Retrait par le demandeur', () => {
  it("possible tant qu'aucune décision n'est rendue", () => {
    const depuisSoumise = soumise();
    depuisSoumise.retirer(USER, T0);
    expect(depuisSoumise.statut).toBe(StatutDemandeAccesPorteur.RETIREE);
    expect(depuisSoumise.decideeLe).toEqual(T0);
    // Un retrait n'est pas une décision de BeOwn : aucun décideur.
    expect(depuisSoumise.decideurAdminId).toBeNull();

    const depuisExamen = soumise();
    depuisExamen.prendreEnExamen(ADMIN);
    depuisExamen.retirer(USER);
    expect(depuisExamen.statut).toBe(StatutDemandeAccesPorteur.RETIREE);
  });

  it("impossible sur la demande d'un autre compte (anti-IDOR dans le domaine)", () => {
    const demande = soumise();
    expect(() => demande.retirer(USER + 1)).toThrow(
      DemandeAccesPorteurEtrangereError,
    );
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
  });

  it('impossible après décision', () => {
    const demande = soumise();
    demande.refuser(ADMIN, MotifRefusAccesPorteur.HORS_CRITERES);
    expect(() => demande.retirer(USER)).toThrow(
      TransitionDemandeInterditeError,
    );
  });
});

describe('Caducité — le compte demandeur a disparu', () => {
  it('close le dossier depuis soumise comme depuis en_examen', () => {
    const depuisSoumise = soumise();
    depuisSoumise.constaterCaducite(T0);
    expect(depuisSoumise.statut).toBe(StatutDemandeAccesPorteur.CADUQUE);
    expect(depuisSoumise.decideeLe).toEqual(T0);

    const depuisExamen = soumise();
    depuisExamen.prendreEnExamen(ADMIN);
    depuisExamen.constaterCaducite(T0);
    expect(depuisExamen.statut).toBe(StatutDemandeAccesPorteur.CADUQUE);
  });

  it("n'est PAS une décision : aucun décideur n'est imputé", () => {
    // Un constat de la plateforme, pas un acte d'instructeur. Poser un
    // décideur ferait dire à la piste d'audit qu'un dossier a été instruit
    // alors que personne ne l'a regardé.
    const demande = soumise();
    demande.constaterCaducite();
    expect(demande.decideurAdminId).toBeNull();
    expect(decisionEstImputable(demande.snapshot())).toBe(true);
  });

  it('est TERMINAL : plus aucune décision possible ensuite', () => {
    const demande = soumise();
    demande.constaterCaducite();
    expect(estTerminal(StatutDemandeAccesPorteur.CADUQUE)).toBe(true);
    expect(demande.estEnCours()).toBe(false);
    expect(() => demande.accepter(ADMIN)).toThrow(
      TransitionDemandeInterditeError,
    );
    expect(() =>
      demande.refuser(ADMIN, MotifRefusAccesPorteur.HORS_CRITERES),
    ).toThrow(TransitionDemandeInterditeError);
    expect(() => demande.prendreEnExamen(ADMIN)).toThrow(
      TransitionDemandeInterditeError,
    );
  });

  it('un dossier déjà clos ne devient pas caduc', () => {
    const demande = soumise();
    demande.accepter(ADMIN);
    expect(() => demande.constaterCaducite()).toThrow(
      TransitionDemandeInterditeError,
    );
  });

  it("se distingue d'un retrait : le demandeur ne s'est pas désisté", () => {
    const caduque = soumise();
    caduque.constaterCaducite();
    const retiree = soumise();
    retiree.retirer(USER);
    expect(caduque.statut).not.toBe(retiree.statut);
  });

  it("n'ouvre aucun délai de carence", () => {
    const demande = soumise();
    demande.constaterCaducite(T0);
    expect(finDeCarence(demande.snapshot())).toBeNull();
  });
});

describe('Délai de carence après refus', () => {
  const refusee = (le: Date) => {
    const demande = soumise();
    demande.refuser(ADMIN, MotifRefusAccesPorteur.HORS_CRITERES, null, le);
    return demande.snapshot();
  };

  it('ouvre une carence de 30 jours après un refus', () => {
    const fin = finDeCarence(refusee(T0));
    const attendu = new Date(T0);
    attendu.setDate(attendu.getDate() + DELAI_CARENCE_APRES_REFUS_JOURS);
    expect(fin).toEqual(attendu);
  });

  it('aucune carence après un retrait volontaire', () => {
    const demande = soumise();
    demande.retirer(USER, T0);
    expect(finDeCarence(demande.snapshot())).toBeNull();
  });

  it('aucune carence après une acceptation', () => {
    const demande = soumise();
    demande.accepter(ADMIN, T0);
    expect(finDeCarence(demande.snapshot())).toBeNull();
  });

  it('aucune carence sur une demande encore ouverte', () => {
    expect(finDeCarence(soumise().snapshot())).toBeNull();
  });
});

describe('Engagement de réponse (CGU : 30 jours indicatifs)', () => {
  it("l'alerte tombe à J+25 et l'échéance à J+30", () => {
    const j25 = alerteInstructionLe(T0);
    const j30 = echeanceReponseIndicative(T0);
    expect(Math.round((j25.getTime() - T0.getTime()) / 86_400_000)).toBe(
      SEUIL_ALERTE_INSTRUCTION_JOURS,
    );
    expect(Math.round((j30.getTime() - T0.getTime()) / 86_400_000)).toBe(30);
  });

  it('une demande ouverte passe en alerte à partir de J+25', () => {
    const etat = soumise().snapshot();
    const veille = new Date(T0.getTime() + 24 * 86_400_000);
    const jour25 = new Date(T0.getTime() + 25 * 86_400_000);
    expect(instructionEnAlerte(etat, veille)).toBe(false);
    expect(instructionEnAlerte(etat, jour25)).toBe(true);
  });

  it('une demande close ne remonte jamais en alerte', () => {
    const demande = soumise();
    demande.accepter(ADMIN, T0);
    const bienPlusTard = new Date(T0.getTime() + 400 * 86_400_000);
    expect(instructionEnAlerte(demande.snapshot(), bienPlusTard)).toBe(false);
  });
});

describe('Encapsulation', () => {
  it('le snapshot est une COPIE : le muter ne change pas la demande', () => {
    const demande = soumise();
    const copie = demande.snapshot();
    copie.statut = StatutDemandeAccesPorteur.ACCEPTEE;
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
  });

  it("restaurer puis snapshot conserve l'état à l'identique", () => {
    const demande = soumise();
    demande.refuser(
      ADMIN,
      MotifRefusAccesPorteur.IDENTITE_NON_VERIFIEE,
      'note interne',
      T0,
    );
    const etat = demande.snapshot();
    expect(DemandeAccesPorteur.restaurer(etat).snapshot()).toEqual(etat);
  });
});
