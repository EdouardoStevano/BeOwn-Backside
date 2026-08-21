import { InvestmentFactory } from './investment.factory';
import { CollecteCapacity } from '../aggregates/collecte-capacity';
import { InvestmentStatus } from '../enums/investment-status.enum';
import {
  FractionsDemandeesIndisponiblesError,
  PlafondPsfpDepasseSansConsentementError,
  ProjetDejaFinanceError,
  ProjetHorsCollecteError,
  TicketAuDessusDuMaximumError,
} from '../errors/subscription.errors';
import type { EligibilitePsfp } from '../value-objects/eligibilite-psfp';
import type { ProjetSouscriptible } from '../value-objects/projet-souscriptible';

const LE_10_JANVIER = new Date('2026-01-10T12:00:00Z');

const projet = (
  etat: Partial<ProjetSouscriptible> = {},
): ProjetSouscriptible => ({
  projetId: 'p-1',
  enCollecte: true,
  dejaFinance: false,
  instrument: 'OBLIGATION',
  prixFraction: 100,
  nbFractionsTotal: 100,
  ticketMaximum: null,
  triCible: 8,
  dureeMois: 12,
  ...etat,
});

const eligibilite = (etat: Partial<EligibilitePsfp> = {}): EligibilitePsfp => ({
  estNonAverti: false,
  plafondConseille: null,
  patrimoineDeclare: 0,
  plancherPlafond: 1_000,
  ...etat,
});

const capacite = (fractionsDejaVendues = 0) =>
  CollecteCapacity.reconstituer({
    projetId: 'p-1',
    nbFractionsTotal: 100,
    fractionsDejaVendues,
  });

describe('InvestmentFactory — souscription directe', () => {
  it('fait naître une souscription ferme au montant des fractions demandées', () => {
    const naissant = InvestmentFactory.souscrire(
      {
        projet: projet(),
        utilisateurId: 42,
        nbFractions: 3,
        eligibilite: eligibilite(),
      },
      capacite(),
      LE_10_JANVIER,
    );

    expect(naissant).toMatchObject({
      projetId: 'p-1',
      utilisateurId: 42,
      montant: 300,
      nbTitres: 3,
      valeurTitre: 100,
      instrument: 'OBLIGATION',
      statut: InvestmentStatus.CONFIRME,
      reservationId: null,
    });
  });

  it('reporte l’identifiant de la réservation dont elle est issue', () => {
    const naissant = InvestmentFactory.souscrire(
      {
        projet: projet(),
        utilisateurId: 42,
        nbFractions: 1,
        eligibilite: eligibilite(),
        reservationId: 'res-1',
      },
      capacite(),
    );

    expect(naissant.reservationId).toBe('res-1');
  });

  it('refuse un projet qui n’est pas en collecte', () => {
    expect(() =>
      InvestmentFactory.souscrire(
        {
          projet: projet({ enCollecte: false }),
          utilisateurId: 42,
          nbFractions: 1,
          eligibilite: eligibilite(),
        },
        capacite(),
      ),
    ).toThrow(ProjetHorsCollecteError);
  });

  it('distingue le projet déjà financé du projet non ouvert', () => {
    expect(() =>
      InvestmentFactory.souscrire(
        {
          projet: projet({ enCollecte: false, dejaFinance: true }),
          utilisateurId: 42,
          nbFractions: 1,
          eligibilite: eligibilite(),
        },
        capacite(),
      ),
    ).toThrow(ProjetDejaFinanceError);
  });

  it('refuse quand la collecte n’a plus assez de fractions', () => {
    expect(() =>
      InvestmentFactory.souscrire(
        {
          projet: projet(),
          utilisateurId: 42,
          nbFractions: 5,
          eligibilite: eligibilite(),
        },
        capacite(98),
      ),
    ).toThrow(FractionsDemandeesIndisponiblesError);
  });

  it('refuse un montant au-dessus du ticket plafond du projet (RG-INV-03)', () => {
    expect(() =>
      InvestmentFactory.souscrire(
        {
          projet: projet({ ticketMaximum: 250 }),
          utilisateurId: 42,
          nbFractions: 3,
          eligibilite: eligibilite(),
        },
        capacite(),
      ),
    ).toThrow(TicketAuDessusDuMaximumError);
  });

  describe('plafond conseillé PSFP (art. 21)', () => {
    it('refuse le dépassement sans consentement explicite', () => {
      expect(() =>
        InvestmentFactory.souscrire(
          {
            projet: projet(),
            utilisateurId: 42,
            nbFractions: 5,
            eligibilite: eligibilite({
              estNonAverti: true,
              plafondConseille: 400,
              patrimoineDeclare: 8_000,
            }),
          },
          capacite(),
        ),
      ).toThrow(PlafondPsfpDepasseSansConsentementError);
    });

    it('laisse passer le dépassement assumé explicitement', () => {
      const naissant = InvestmentFactory.souscrire(
        {
          projet: projet(),
          utilisateurId: 42,
          nbFractions: 5,
          eligibilite: eligibilite({
            estNonAverti: true,
            plafondConseille: 400,
            patrimoineDeclare: 8_000,
          }),
          consentementDepassementLimite: true,
        },
        capacite(),
      );

      expect(naissant.montant).toBe(500);
    });

    it('n’oppose aucun plafond à un investisseur dont le statut n’en recommande pas', () => {
      const naissant = InvestmentFactory.souscrire(
        {
          projet: projet(),
          utilisateurId: 42,
          nbFractions: 50,
          eligibilite: eligibilite({ plafondConseille: null }),
        },
        capacite(),
      );

      expect(naissant.montant).toBe(5_000);
    });
  });

  describe('fenêtre de rétractation', () => {
    it('ouvre 4 jours à l’investisseur non-averti', () => {
      const naissant = InvestmentFactory.souscrire(
        {
          projet: projet(),
          utilisateurId: 42,
          nbFractions: 1,
          eligibilite: eligibilite({ estNonAverti: true }),
        },
        capacite(),
        LE_10_JANVIER,
      );

      expect(naissant.delaiRetractationJusquAu).toEqual(
        new Date('2026-01-14T12:00:00Z'),
      );
    });

    it('n’en ouvre aucune à l’investisseur averti', () => {
      const naissant = InvestmentFactory.souscrire(
        {
          projet: projet(),
          utilisateurId: 42,
          nbFractions: 1,
          eligibilite: eligibilite({ estNonAverti: false }),
        },
        capacite(),
        LE_10_JANVIER,
      );

      expect(naissant.delaiRetractationJusquAu).toBeNull();
    });
  });

  it('consomme les fractions sur la capacité de collecte', () => {
    const collecte = capacite(10);

    InvestmentFactory.souscrire(
      {
        projet: projet(),
        utilisateurId: 42,
        nbFractions: 4,
        eligibilite: eligibilite(),
      },
      collecte,
    );

    expect(collecte.fractionsDejaVendues).toBe(14);
  });
});

describe('InvestmentFactory — souscription par signature', () => {
  it('fait naître un investissement INITIE, sans débit ni fenêtre de rétractation', () => {
    const naissant = InvestmentFactory.initier(
      { projet: projet(), utilisateurId: 42, nbFractions: 2 },
      capacite(),
    );

    expect(naissant).toMatchObject({
      montant: 200,
      statut: InvestmentStatus.INITIE,
      delaiRetractationJusquAu: null,
      signatureId: null,
    });
  });

  it('éprouve les mêmes portes de projet et de capacité que la souscription directe', () => {
    expect(() =>
      InvestmentFactory.initier(
        {
          projet: projet({ enCollecte: false, dejaFinance: true }),
          utilisateurId: 42,
          nbFractions: 1,
        },
        capacite(),
      ),
    ).toThrow(ProjetDejaFinanceError);

    expect(() =>
      InvestmentFactory.initier(
        { projet: projet(), utilisateurId: 42, nbFractions: 5 },
        capacite(98),
      ),
    ).toThrow(FractionsDemandeesIndisponiblesError);
  });
});
