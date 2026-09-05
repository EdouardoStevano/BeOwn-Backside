import {
  deriverCleIdempotence,
  FENETRE_IDEMPOTENCE_MS,
} from './cle-derivee';

/**
 * Le repli était `randomUUID()` : une clé neuve à chaque appel, donc AUCUNE
 * idempotence quand le client n'en fournissait pas. Deux soumissions du même
 * retrait — double-clic, renvoi de formulaire, reprise réseau du navigateur —
 * produisaient deux clés distinctes et DEUX retraits. La contrainte d'unicité
 * ne pouvait rien : on lui donnait deux valeurs pour la même intention.
 */
describe('deriverCleIdempotence', () => {
  const base = {
    userId: 42,
    type: 'retrait',
    cible: 'w-1',
    montant: 100,
    maintenantMs: 1_000_000,
  };

  it('deux appels identiques dans la fenêtre produisent la MÊME clé', () => {
    expect(deriverCleIdempotence(base)).toBe(
      deriverCleIdempotence({ ...base, maintenantMs: base.maintenantMs + 5_000 }),
    );
  });

  it('deux appels espacés au-delà de la fenêtre produisent des clés distinctes', () => {
    // Une seconde opération volontairement identique doit pouvoir passer.
    expect(deriverCleIdempotence(base)).not.toBe(
      deriverCleIdempotence({
        ...base,
        maintenantMs: base.maintenantMs + 2 * FENETRE_IDEMPOTENCE_MS,
      }),
    );
  });

  it.each([
    ['utilisateur', { userId: 43 }],
    ['type', { type: 'souscription' }],
    ['cible', { cible: 'w-2' }],
    ['montant', { montant: 100.01 }],
  ])('un %s différent change la clé', (_cas, patch) => {
    expect(deriverCleIdempotence(base)).not.toBe(
      deriverCleIdempotence({ ...base, ...patch }),
    );
  });

  it('le montant est comparé EN CENTIMES : 100.10 et 100.1 sont la même somme', () => {
    expect(deriverCleIdempotence({ ...base, montant: 100.1 })).toBe(
      deriverCleIdempotence({ ...base, montant: 100.10 }),
    );
  });

  it('la clé est lisible : préfixée par le type', () => {
    expect(deriverCleIdempotence(base)).toMatch(/^retrait:auto:[0-9a-f]{32}$/);
  });

  it('ne fuit ni le montant ni l’identifiant en clair', () => {
    const cle = deriverCleIdempotence({ ...base, userId: 987654, montant: 4242 });

    expect(cle).not.toContain('987654');
    expect(cle).not.toContain('4242');
  });
});
