import { ConfirmerUnDepotUseCase } from './confirmer-un-depot.usecase';
import { Money } from 'src/treasury/domain/value-objects/money.vo';
import { PaiementEtrangerAuCompteError } from 'src/treasury/domain/errors/treasury.errors';
import type { Paiement } from '../ports/payment.gateway';

const TITULAIRE = 42;

const paiement = (etat: Partial<Paiement> = {}): Paiement => ({
  intentId: 'pi_1',
  clientSecret: 'cs_1',
  statut: 'succeeded',
  montant: Money.euros(100),
  utilisateurId: TITULAIRE,
  operationType: 'depot',
  metadata: {},
  ...etat,
});

function monter(etat: { paiement?: Paiement } = {}) {
  const paiements = {
    lireLePaiement: jest.fn().mockResolvedValue(etat.paiement ?? paiement()),
  };
  const crediter = {
    execute: jest.fn().mockResolvedValue({ issue: 'credite', walletId: 'w-1' }),
  };

  const useCase = new ConfirmerUnDepotUseCase(
    paiements as never,
    crediter as never,
  );

  return { useCase, paiements, crediter };
}

/**
 * Non-régression du correctif H-1 (audit du 21/07/2026) — la garde anti-BOLA
 * du dépôt. Elle vivait dans `PaymentController` ; la déplacer dans un use case
 * ne la relâche pas, et ces tests l'éprouvent désormais sans monter de
 * contrôleur ni de base de données.
 */
describe('ConfirmerUnDepotUseCase — propriété du paiement (H-1)', () => {
  it("refuse de créditer le paiement d'un autre titulaire", async () => {
    const { useCase, crediter } = monter({
      paiement: paiement({ utilisateurId: 99 }),
    });

    await expect(
      useCase.execute({
        utilisateurId: TITULAIRE,
        paymentIntentId: 'pi_victime',
      }),
    ).rejects.toBeInstanceOf(PaiementEtrangerAuCompteError);

    expect(crediter.execute).not.toHaveBeenCalled();
  });

  it('refuse un paiement qui ne porte aucun titulaire', async () => {
    // Le repli inverse — créditer l'appelant — serait exactement l'abus que la
    // garde empêche.
    const { useCase, crediter } = monter({
      paiement: paiement({ utilisateurId: null }),
    });

    await expect(
      useCase.execute({ utilisateurId: TITULAIRE, paymentIntentId: 'pi_x' }),
    ).rejects.toBeInstanceOf(PaiementEtrangerAuCompteError);

    expect(crediter.execute).not.toHaveBeenCalled();
  });

  it('crédite quand le paiement appartient bien à l’appelant', async () => {
    const { useCase, crediter } = monter();

    const issue = await useCase.execute({
      utilisateurId: TITULAIRE,
      paymentIntentId: 'pi_1',
    });

    expect(issue).toEqual({ issue: 'credite', walletId: 'w-1' });
    expect(crediter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: TITULAIRE,
        paymentIntentId: 'pi_1',
      }),
    );
  });

  it('ne croit pas le client sur le sort du paiement : il le relit', async () => {
    const { useCase, paiements, crediter } = monter({
      paiement: paiement({ statut: 'requires_payment_method' }),
    });

    const issue = await useCase.execute({
      utilisateurId: TITULAIRE,
      paymentIntentId: 'pi_1',
    });

    expect(paiements.lireLePaiement).toHaveBeenCalledWith('pi_1');
    expect(issue).toEqual({
      issue: 'paiement-non-abouti',
      statut: 'requires_payment_method',
    });
    expect(crediter.execute).not.toHaveBeenCalled();
  });

  it('rend le montant lu chez le fournisseur, jamais celui annoncé', async () => {
    // Le montant ne figure pas dans la commande : il vient du paiement relu.
    // C'est ce qui interdit de confirmer 10 € et de se faire créditer 1 000 €.
    const { useCase, crediter } = monter({
      paiement: paiement({ montant: Money.euros(37.5) }),
    });

    await useCase.execute({
      utilisateurId: TITULAIRE,
      paymentIntentId: 'pi_1',
    });

    expect(crediter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ montant: Money.euros(37.5) }),
    );
  });
});
