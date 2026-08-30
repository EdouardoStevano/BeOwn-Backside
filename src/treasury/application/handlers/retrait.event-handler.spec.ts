import { RetraitEventHandler } from './retrait.event-handler';
import { Money } from 'src/treasury/domain/value-objects/money.vo';
import {
  RetraitADemanderManuellementDomainEvent,
  RetraitEchoueDomainEvent,
  RetraitEnRouteDomainEvent,
  RetraitEnSouffranceDomainEvent,
  RetraitVerseDomainEvent,
} from 'src/treasury/domain/events/retrait.domain-event';

const TITULAIRE = 42;
const CENT = Money.euros(100);

function monter() {
  const notifier = {
    retraitEnRoute: jest.fn(),
    retraitManuelADemander: jest.fn(),
    retraitVerse: jest.fn(),
    retraitEchoue: jest.fn(),
    interventionRequise: jest.fn(),
  };

  return { handler: new RetraitEventHandler(notifier as never), notifier };
}

describe('RetraitEventHandler — à chaque fait son destinataire', () => {
  it('annonce au titulaire que son retrait est parti', () => {
    const { handler, notifier } = monter();

    handler.handle(new RetraitEnRouteDomainEvent(TITULAIRE, 'tx-1', CENT));

    expect(notifier.retraitEnRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: TITULAIRE,
        transactionId: 'tx-1',
      }),
    );
  });

  it('adresse le retrait manuel au back-office, pas au titulaire', () => {
    // Le seul fait de retrait dont le destinataire n'est pas l'investisseur :
    // c'est une tâche pour l'équipe finance.
    const { handler, notifier } = monter();

    handler.handle(
      new RetraitADemanderManuellementDomainEvent(
        TITULAIRE,
        'tx-1',
        CENT,
        'FR76...',
      ),
    );

    expect(notifier.retraitManuelADemander).toHaveBeenCalled();
    expect(notifier.retraitEnRoute).not.toHaveBeenCalled();
  });

  it('annonce le versement arrivé en banque', () => {
    const { handler, notifier } = monter();

    handler.handle(new RetraitVerseDomainEvent(TITULAIRE, 'tx-1', CENT));

    expect(notifier.retraitVerse).toHaveBeenCalled();
  });

  it('annonce le retrait échoué et le solde rendu', () => {
    const { handler, notifier } = monter();

    handler.handle(new RetraitEchoueDomainEvent(TITULAIRE, 'tx-1', CENT));

    expect(notifier.retraitEchoue).toHaveBeenCalled();
  });

  it('escalade un retrait que la plateforme ne sait pas dénouer', () => {
    const { handler, notifier } = monter();

    handler.handle(
      new RetraitEnSouffranceDomainEvent('Rapatriement échoué', 'À reprendre', {
        transactionId: 'tx-1',
      }),
    );

    expect(notifier.interventionRequise).toHaveBeenCalledWith(
      expect.objectContaining({ titre: 'Rapatriement échoué' }),
    );
  });

  it("n'échoue jamais : un mouvement de fonds ne se défait pas sur une annonce", () => {
    // Le bus n'attend pas les réactions, mais un abonné qui lève polluerait
    // les journaux d'une trace non rattrapable. La garantie est ici.
    const { handler, notifier } = monter();
    notifier.retraitVerse.mockImplementation(() => {
      throw new Error('service de notification indisponible');
    });

    expect(() =>
      handler.handle(new RetraitVerseDomainEvent(TITULAIRE, 'tx-1', CENT)),
    ).not.toThrow();
  });
});
