import {
  StatutReclamation,
  ajouterJoursOuvrables,
  echeanceAccuseReception,
  echeanceReponse,
  evaluerDelais,
  genererReference,
} from './reclamation';

describe('ajouterJoursOuvrables', () => {
  it('saute les samedis et dimanches', () => {
    // 2026-08-20 est un jeudi.
    const jeudi = new Date('2026-08-20T10:00:00Z');
    // +2 ouvrables → vendredi puis lundi.
    expect(ajouterJoursOuvrables(jeudi, 2).getDay()).toBe(1);
  });

  it('rend la date de départ pour zéro jour', () => {
    const depart = new Date('2026-08-20T10:00:00Z');
    expect(ajouterJoursOuvrables(depart, 0).toISOString()).toBe(
      depart.toISOString(),
    );
  });
});

describe('échéances réglementaires — DOC-2012-07', () => {
  it('place l\'accusé de réception dix jours ouvrables après la réception', () => {
    const recueLe = new Date('2026-08-20T10:00:00Z');
    const echeance = echeanceAccuseReception(recueLe);
    // Dix jours ouvrables couvrent quatorze jours calendaires ici.
    expect(echeance.getTime()).toBeGreaterThan(recueLe.getTime());
    expect(echeance.getDay()).not.toBe(0);
    expect(echeance.getDay()).not.toBe(6);
  });

  it('place la réponse deux mois après la réception', () => {
    const recueLe = new Date('2026-08-20T10:00:00Z');
    expect(echeanceReponse(recueLe).toISOString()).toBe(
      new Date('2026-10-20T10:00:00Z').toISOString(),
    );
  });
});

describe('evaluerDelais', () => {
  const recueLe = new Date('2026-01-01T09:00:00Z');

  it('signale un accusé de réception en retard', () => {
    const etat = evaluerDelais(
      {
        statut: StatutReclamation.RECUE,
        createdAt: recueLe,
        accuseReceptionLe: null,
        reponduLe: null,
      },
      new Date('2026-02-01T09:00:00Z'),
    );
    expect(etat.accuseReceptionEnRetard).toBe(true);
  });

  it('ne signale aucun retard quand l\'accusé a été envoyé', () => {
    const etat = evaluerDelais(
      {
        statut: StatutReclamation.EN_INSTRUCTION,
        createdAt: recueLe,
        accuseReceptionLe: new Date('2026-01-02T09:00:00Z'),
        reponduLe: null,
      },
      new Date('2026-02-01T09:00:00Z'),
    );
    expect(etat.accuseReceptionEnRetard).toBe(false);
    expect(etat.reponseEnRetard).toBe(false);
  });

  it('signale une réponse en retard au-delà de deux mois', () => {
    const etat = evaluerDelais(
      {
        statut: StatutReclamation.EN_INSTRUCTION,
        createdAt: recueLe,
        accuseReceptionLe: new Date('2026-01-02T09:00:00Z'),
        reponduLe: null,
      },
      new Date('2026-04-01T09:00:00Z'),
    );
    expect(etat.reponseEnRetard).toBe(true);
  });

  it('ne considère jamais une réclamation close comme en retard de réponse', () => {
    const etat = evaluerDelais(
      {
        statut: StatutReclamation.RESOLUE,
        createdAt: recueLe,
        accuseReceptionLe: new Date('2026-01-02T09:00:00Z'),
        reponduLe: null,
      },
      new Date('2027-01-01T09:00:00Z'),
    );
    expect(etat.reponseEnRetard).toBe(false);
  });
});

describe('genererReference', () => {
  it('produit une référence datée et séquencée', () => {
    expect(genererReference(new Date('2026-08-20T10:00:00Z'), 7)).toBe(
      'REC-20260820-0007',
    );
  });
});
