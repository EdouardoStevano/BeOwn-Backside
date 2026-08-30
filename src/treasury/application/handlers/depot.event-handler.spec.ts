import { DepotEventHandler } from './depot.event-handler';
import { Money } from 'src/treasury/domain/value-objects/money.vo';
import {
  CompteDeRetraitActiveDomainEvent,
  DepotCrediteDomainEvent,
} from 'src/treasury/domain/events/depot.domain-event';

const TITULAIRE = 42;

const depot = () =>
  new DepotCrediteDomainEvent(TITULAIRE, 'w-1', Money.euros(500), 'pi_1');

function monter() {
  const notifier = {
    depotCredite: jest.fn(),
    depotCrediteAuxAdministrateurs: jest.fn(),
    compteDeRetraitActive: jest.fn(),
  };

  return { handler: new DepotEventHandler(notifier as never), notifier };
}

describe('DepotEventHandler', () => {
  it('un dépôt intéresse le titulaire **et** la finance', () => {
    // C'est ici que se décide qui apprend un dépôt : le use case créditait et
    // choisissait lui-même ses deux destinataires.
    const { handler, notifier } = monter();

    handler.handle(depot());

    expect(notifier.depotCredite).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: TITULAIRE,
        paymentIntentId: 'pi_1',
      }),
    );
    expect(notifier.depotCrediteAuxAdministrateurs).toHaveBeenCalled();
  });

  it("annonce l'activation du compte de retrait au seul titulaire", () => {
    const { handler, notifier } = monter();

    handler.handle(new CompteDeRetraitActiveDomainEvent(TITULAIRE, 'acct_1'));

    expect(notifier.compteDeRetraitActive).toHaveBeenCalledWith(
      expect.objectContaining({ utilisateurId: TITULAIRE, compteId: 'acct_1' }),
    );
    expect(notifier.depotCredite).not.toHaveBeenCalled();
  });

  it("n'échoue jamais : un crédit ne se défait pas sur une annonce", () => {
    const { handler, notifier } = monter();
    notifier.depotCredite.mockImplementation(() => {
      throw new Error('service de notification indisponible');
    });

    expect(() => handler.handle(depot())).not.toThrow();
  });
});
