import { YouSignWebhookController } from './yousign-webhook.controller';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';

/**
 * I(b) — LES REFUS N'ÉTAIENT ROUTÉS NULLE PART.
 *
 * `signature_request.declined` et `.canceled` tombaient dans le vide : la
 * signature restait PENDING, l'annonce restait bloquée en `accepte` hors du
 * carnet, et les fonds de l'acheteur restaient réservés — jusqu'au passage du
 * balayeur des ordres orphelins, des heures plus tard. Le vendeur perdait son
 * annonce et l'acheteur son argent pour un refus dont la plateforme était
 * pourtant informée à la seconde.
 */
describe('YouSignWebhookController — refus et annulation de signature', () => {
  const construire = () => {
    const expirerSignature = {
      parRequeteFournisseur: jest.fn().mockResolvedValue('compense'),
    };
    const finalizeSignedContract = { execute: jest.fn() };
    const controller = new YouSignWebhookController(
      { verifyWebhookSignature: jest.fn().mockReturnValue(true) } as any,
      { incrementCounter: jest.fn() } as any,
      expirerSignature as any,
      finalizeSignedContract as any,
    );
    return { controller, expirerSignature, finalizeSignedContract };
  };

  const evenement = (nom: string) => ({
    event_name: nom,
    data: { signature_request: { id: 'ys-req-1' } },
  });

  // Ordre réel des paramètres : (req, payload, signature).
  const declencher = (controller: any, nom: string) =>
    controller.handleWebhook(
      { rawBody: Buffer.from('{}') } as any,
      evenement(nom),
      'sig',
    );

  it.each([
    'signature_request.declined',
    'signature_request.canceled',
    'signature_request.cancelled',
  ])('%s : compensation IMMÉDIATE de la cession', async (nom) => {
    const h = construire();

    await declencher(h.controller, nom);

    expect(h.expirerSignature.parRequeteFournisseur).toHaveBeenCalledWith(
      'ys-req-1',
      SignatureStatus.CANCELLED,
    );
  });

  it('la signature est marquée CANCELLED, pas EXPIRED — un refus n’est pas un oubli', async () => {
    const h = construire();

    await declencher(h.controller, 'signature_request.declined');

    const [, statut] = h.expirerSignature.parRequeteFournisseur.mock.calls[0];
    expect(statut).toBe(SignatureStatus.CANCELLED);
    expect(statut).not.toBe(SignatureStatus.EXPIRED);
  });

  it('une expiration reste une EXPIRATION (comportement inchangé)', async () => {
    const h = construire();

    await declencher(h.controller, 'signature_request.expired');

    expect(h.expirerSignature.parRequeteFournisseur).toHaveBeenCalledWith(
      'ys-req-1',
    );
  });

  it('un refus ne finalise JAMAIS le contrat', async () => {
    const h = construire();

    await declencher(h.controller, 'signature_request.declined');

    expect(h.finalizeSignedContract.execute).not.toHaveBeenCalled();
  });

  it('un échec de compensation ne fait pas échouer le webhook', async () => {
    const h = construire();
    h.expirerSignature.parRequeteFournisseur.mockRejectedValue(
      new Error('base indisponible'),
    );

    // Le prestataire rejouerait indéfiniment un webhook en erreur ; on accuse
    // réception et on journalise.
    await expect(
      declencher(h.controller, 'signature_request.declined'),
    ).resolves.toEqual({ received: true });
  });

  it('un événement inconnu est ignoré sans effet', async () => {
    const h = construire();

    await declencher(h.controller, 'signature_request.reminder_sent');

    expect(h.expirerSignature.parRequeteFournisseur).not.toHaveBeenCalled();
    expect(h.finalizeSignedContract.execute).not.toHaveBeenCalled();
  });
});
