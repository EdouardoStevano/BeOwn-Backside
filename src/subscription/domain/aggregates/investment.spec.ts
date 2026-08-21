import { Investment, type InvestmentSnapshot } from './investment';
import { InvestmentStatus } from '../enums/investment-status.enum';
import {
  AccesInvestissementRefuseError,
  DelaiDeRetractationExpireError,
  InvestissementDejaSigneError,
  InvestissementNonCompletableError,
  InvestissementNonRetractableError,
  InvestissementSansFractionsActivesError,
  QuantiteDeFractionsInvalideError,
  RetractationReserveeAuTitulaireError,
} from '../errors/subscription.errors';

const TITULAIRE = 42;
const UN_AUTRE = 7;
const LE_10_JANVIER = new Date('2026-01-10T12:00:00Z');
const LE_12_JANVIER = new Date('2026-01-12T12:00:00Z');
const LE_16_JANVIER = new Date('2026-01-16T12:00:00Z');

const investissement = (etat: Partial<InvestmentSnapshot> = {}): Investment =>
  new Investment({
    id: 'inv-1',
    projetId: 'p-1',
    utilisateurId: TITULAIRE,
    montant: 500,
    instrument: 'OBLIGATION',
    nbTitres: 5,
    valeurTitre: 100,
    statut: InvestmentStatus.CONFIRME,
    delaiRetractationJusquAu: LE_16_JANVIER,
    bulletinDocId: null,
    signatureId: null,
    reservationId: null,
    createdAt: LE_10_JANVIER,
    updatedAt: LE_10_JANVIER,
    ...etat,
  });

describe('Investment — rétractation PSFP', () => {
  it('retire l’engagement quand le titulaire agit dans la fenêtre de 4 jours', () => {
    const inv = investissement();

    inv.retracter(TITULAIRE, LE_12_JANVIER);

    expect(inv.statut).toBe(InvestmentStatus.RETRACTE);
    expect(inv.estActif).toBe(false);
  });

  it('refuse la rétractation demandée par quelqu’un d’autre que le titulaire', () => {
    const inv = investissement();

    expect(() => inv.retracter(UN_AUTRE, LE_12_JANVIER)).toThrow(
      RetractationReserveeAuTitulaireError,
    );
    expect(inv.statut).toBe(InvestmentStatus.CONFIRME);
  });

  it('refuse de rétracter un investissement qui n’est pas confirmé', () => {
    const inv = investissement({ statut: InvestmentStatus.INITIE });

    expect(() => inv.retracter(TITULAIRE, LE_12_JANVIER)).toThrow(
      InvestissementNonRetractableError,
    );
  });

  it('refuse de rétracter deux fois — le second appel ne trouve plus un CONFIRME', () => {
    const inv = investissement();
    inv.retracter(TITULAIRE, LE_12_JANVIER);

    expect(() => inv.retracter(TITULAIRE, LE_12_JANVIER)).toThrow(
      InvestissementNonRetractableError,
    );
  });

  it('refuse la rétractation une fois la fenêtre de 4 jours refermée', () => {
    const inv = investissement();

    expect(() =>
      inv.retracter(TITULAIRE, new Date('2026-01-17T12:00:00Z')),
    ).toThrow(DelaiDeRetractationExpireError);
    expect(inv.statut).toBe(InvestmentStatus.CONFIRME);
  });

  it('estRetractable suit la fenêtre sans rien modifier', () => {
    const inv = investissement();

    expect(inv.estRetractable(LE_12_JANVIER)).toBe(true);
    expect(inv.estRetractable(new Date('2026-01-17T12:00:00Z'))).toBe(false);
    expect(inv.statut).toBe(InvestmentStatus.CONFIRME);
  });
});

describe('Investment — complément de fractions', () => {
  it('ajoute les fractions au prix payé à la souscription et rend le montant à débiter', () => {
    const inv = investissement();

    const delta = inv.completer(TITULAIRE, 2, 999);

    // Le prix de référence (999) est ignoré : `valeurTitre` vaut 100.
    expect(delta).toBe(200);
    expect(inv.nbTitres).toBe(7);
    expect(inv.montant).toBe(700);
  });

  it('retombe sur le prix de référence quand l’investissement n’en porte pas', () => {
    const inv = investissement({ valeurTitre: null });

    expect(inv.completer(TITULAIRE, 2, 150)).toBe(300);
  });

  it('refuse le complément demandé par quelqu’un d’autre que le titulaire', () => {
    const inv = investissement();

    expect(() => inv.completer(UN_AUTRE, 2, 100)).toThrow(
      AccesInvestissementRefuseError,
    );
    expect(inv.montant).toBe(500);
  });

  it('refuse de compléter un investissement non confirmé', () => {
    const inv = investissement({ statut: InvestmentStatus.RETRACTE });

    expect(() => inv.completer(TITULAIRE, 2, 100)).toThrow(
      InvestissementNonCompletableError,
    );
  });

  it('refuse de compléter un investissement sans fractions actives', () => {
    const inv = investissement({ nbTitres: 0 });

    expect(() => inv.completer(TITULAIRE, 2, 100)).toThrow(
      InvestissementSansFractionsActivesError,
    );
  });

  it.each([0, -1, 1.5])(
    'refuse une quantité de fractions invalide (%p)',
    (quantite) => {
      const inv = investissement();

      expect(() => inv.completer(TITULAIRE, quantite, 100)).toThrow(
        QuantiteDeFractionsInvalideError,
      );
      expect(inv.montant).toBe(500);
    },
  );
});

describe('Investment — signature et bulletin', () => {
  it('rattache une demande de signature sans faire passer l’investissement à SIGNE', () => {
    const inv = investissement({ statut: InvestmentStatus.INITIE });

    inv.rattacherDemandeDeSignature('sig-1');

    expect(inv.signatureId).toBe('sig-1');
    expect(inv.statut).toBe(InvestmentStatus.INITIE);
  });

  it('refuse d’ouvrir une demande de signature sur un investissement déjà signé', () => {
    const inv = investissement({
      statut: InvestmentStatus.SIGNE,
      signatureId: 'sig-1',
    });

    expect(() => inv.rattacherDemandeDeSignature('sig-2')).toThrow(
      InvestissementDejaSigneError,
    );
    expect(inv.signatureId).toBe('sig-1');
  });

  it('rattache le bulletin généré', () => {
    const inv = investissement();

    inv.attacherBulletin('doc-1');

    expect(inv.bulletinDocId).toBe('doc-1');
  });
});

describe('Investment — état publié', () => {
  it('rend un snapshot qui reflète les transitions jouées', () => {
    const inv = investissement();
    inv.completer(TITULAIRE, 1, 100);
    inv.attacherBulletin('doc-1');

    expect(inv.snapshot()).toMatchObject({
      id: 'inv-1',
      montant: 600,
      nbTitres: 6,
      bulletinDocId: 'doc-1',
      statut: InvestmentStatus.CONFIRME,
    });
  });

  it('ne compte plus dans la collecte une fois annulé', () => {
    expect(investissement().estActif).toBe(true);
    expect(investissement({ statut: InvestmentStatus.ANNULE }).estActif).toBe(
      false,
    );
    expect(investissement({ statut: InvestmentStatus.RETRACTE }).estActif).toBe(
      false,
    );
  });
});
