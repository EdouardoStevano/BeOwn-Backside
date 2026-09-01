import { StripeConnectService } from './stripe-connect.service';
import type { KycIdentityDocument } from '../applications/ports/kyc-document.port';

/**
 * L'attache de la pièce KYC au compte Connect est un best-effort qui touche à
 * de l'argent réel (elle conditionne la levée des exigences de vérification) :
 * ces tests figent les trois garanties qui comptent —
 *   1. le fichier est re-téléversé DANS LE PÉRIMÈTRE du compte connecté
 *      (purpose identity_document + stripeAccount), jamais côté plateforme ;
 *   2. sans pièce disponible, AUCUN appel Stripe n'est émis ;
 *   3. aucune défaillance (source, upload, update) ne sort de la méthode.
 *
 * Le service est construit à la main avec des doublures minimales : seul le
 * chemin attachKycDocument est exercé, aucun réseau, aucune base.
 */
const face = (name: string) => ({
  data: Buffer.from(`octets-${name}`),
  mimeType: 'image/jpeg',
  filename: `${name}.jpg`,
});

describe('StripeConnectService.attachKycDocument', () => {
  const buildService = (piece: KycIdentityDocument | null) => {
    const stripe = {
      files: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'file_front' })
          .mockResolvedValueOnce({ id: 'file_back' }),
      },
      accounts: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new StripeConnectService(
      { get: jest.fn() } as never, // ConfigService — non sollicité ici
      { client: stripe } as never, // StripePaymentService
      { findOne: jest.fn(), save: jest.fn() } as never, // userRepo
      { findByUserId: jest.fn() } as never, // InvestorIdentityReader
      { findByUserId: jest.fn().mockResolvedValue(piece) } as never, // KycDocumentSource
    );
    return { service, stripe };
  };

  it('téléverse chaque face dans le périmètre du compte connecté puis les attache', async () => {
    const { service, stripe } = buildService({
      front: face('recto'),
      back: face('verso'),
    });

    await service.attachKycDocument('acct_test', 9);

    expect(stripe.files.create).toHaveBeenCalledTimes(2);
    expect(stripe.files.create).toHaveBeenNthCalledWith(
      1,
      {
        purpose: 'identity_document',
        file: {
          data: Buffer.from('octets-recto'),
          name: 'recto.jpg',
          type: 'image/jpeg',
        },
      },
      { stripeAccount: 'acct_test' },
    );
    expect(stripe.accounts.update).toHaveBeenCalledWith('acct_test', {
      individual: {
        verification: {
          document: { front: 'file_front', back: 'file_back' },
        },
      },
    });
  });

  it("n'envoie pas de clé back pour un document à face unique (passeport)", async () => {
    const { service, stripe } = buildService({ front: face('recto'), back: null });

    await service.attachKycDocument('acct_test', 9);

    expect(stripe.files.create).toHaveBeenCalledTimes(1);
    expect(stripe.accounts.update).toHaveBeenCalledWith('acct_test', {
      individual: { verification: { document: { front: 'file_front' } } },
    });
  });

  it("sans pièce disponible, n'émet AUCUN appel Stripe", async () => {
    const { service, stripe } = buildService(null);

    await service.attachKycDocument('acct_test', 9);

    expect(stripe.files.create).not.toHaveBeenCalled();
    expect(stripe.accounts.update).not.toHaveBeenCalled();
  });

  it.each([
    [
      'la source lève',
      (s: ReturnType<typeof buildService>) =>
        ((s.service as never as { kycDocuments: { findByUserId: jest.Mock } })
          .kycDocuments.findByUserId as jest.Mock).mockRejectedValue(
          new Error('source en panne'),
        ),
    ],
    [
      "l'upload est refusé",
      (s: ReturnType<typeof buildService>) =>
        s.stripe.files.create.mockReset().mockRejectedValue(new Error('403')),
    ],
    [
      "l'update est refusé (compte déjà réclamé)",
      (s: ReturnType<typeof buildService>) =>
        s.stripe.accounts.update
          .mockReset()
          .mockRejectedValue(
            new Error(
              "This application does not have the required permissions for the parameter 'individual'",
            ),
          ),
    ],
  ])('ne laisse JAMAIS sortir une exception quand %s', async (_cas, saboter) => {
    const built = buildService({ front: face('recto'), back: null });
    saboter(built);

    await expect(
      built.service.attachKycDocument('acct_test', 9),
    ).resolves.toBeUndefined();
  });
});
