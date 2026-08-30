import { StripeIdentityAdapter } from './stripe-identity.adapter';

/**
 * La forme d'un `VerificationReport`, telle que Stripe la rend réellement —
 * relevée sur un rapport de test le 29/08/2026.
 *
 * Elle est reproduite ici parce que la lecture précédente supposait autre
 * chose : `document.files` était lu comme un objet `{ front, back }` alors que
 * c'est un **tableau** d'identifiants, et `selfie.selfie` comme un objet
 * contenant un `file` alors que c'est directement l'identifiant. Les trois
 * pièces ressortaient donc `undefined`, et aucun test ne le voyait : c'est le
 * genre d'erreur qu'une ACL non éprouvée laisse passer indéfiniment (§20).
 */
const RAPPORT_STRIPE = {
  id: 'vr_1',
  document: {
    status: 'unverified',
    type: 'id_card',
    name: { first_name: 'Jean', last_name: 'Dupont' },
    dob: { year: 1990, month: 3, day: 7 },
    nationality: 'FR',
    number: 'X4RTBPFW4',
    expiration_date: { year: 2030, month: 11, day: 2 },
    // Recto puis verso. Un passeport n'a qu'une seule entrée.
    files: ['file_recto', 'file_verso'],
  },
  selfie: {
    status: 'unverified',
    // La pièce à laquelle le visage a été comparé — déjà `files[0]`.
    document: 'file_recto',
    // Le portrait lui-même.
    selfie: 'file_selfie',
  },
};

function monter(rapport: unknown = RAPPORT_STRIPE) {
  const stripe = {
    identity: {
      verificationSessions: {
        retrieve: jest
          .fn()
          .mockResolvedValue({ last_verification_report: rapport }),
      },
    },
  };

  const adapter = new StripeIdentityAdapter(
    { getOrThrow: jest.fn(() => 'sk_test_x'), get: jest.fn() } as never,
    // Le stockage n'intervient qu'à l'archivage des pièces, pas à la lecture
    // du rapport : cette doublure ne sera pas appelée.
    {} as never,
  );
  // Le client est instancié dans le constructeur : on le remplace par la
  // doublure, faute de pouvoir l'injecter (§20 — l'adaptateur possède son SDK).
  Object.defineProperty(adapter, 'stripe', { value: stripe, writable: true });

  return { adapter, stripe };
}

describe('StripeIdentityAdapter.extractReportData', () => {
  it('lit les deux faces du document dans le tableau `files`', async () => {
    const { adapter } = monter();

    const rapport = await adapter.extractReportData('vs_1');

    expect(rapport).toMatchObject({
      reportId: 'vr_1',
      documentFrontFileId: 'file_recto',
      documentBackFileId: 'file_verso',
    });
  });

  it('prend `selfie.selfie` comme portrait, et non la pièce comparée', async () => {
    // `selfie.document` vaut `file_recto` : le rendre comme selfie ferait
    // passer une photo de document pour un portrait.
    const { adapter } = monter();

    const rapport = await adapter.extractReportData('vs_1');

    expect(rapport?.selfieFileId).toBe('file_selfie');
  });

  it("n'invente pas de verso pour un document qui n'en a qu'un", async () => {
    const { adapter } = monter({
      ...RAPPORT_STRIPE,
      document: {
        ...RAPPORT_STRIPE.document,
        type: 'passport',
        files: ['file_recto'],
      },
    });

    const rapport = await adapter.extractReportData('vs_1');

    expect(rapport?.documentFrontFileId).toBe('file_recto');
    expect(rapport?.documentBackFileId).toBeUndefined();
  });

  it('traduit les dates éclatées du fournisseur en dates lisibles', async () => {
    const { adapter } = monter();

    const rapport = await adapter.extractReportData('vs_1');

    expect(rapport).toMatchObject({
      dateNaissance: '1990-03-07',
      dateExpiration: '2030-11-02',
      nom: 'Dupont',
      prenom: 'Jean',
    });
  });

  it('supporte un rapport sans aucune pièce', async () => {
    const { adapter } = monter({ id: 'vr_2' });

    const rapport = await adapter.extractReportData('vs_1');

    expect(rapport).toMatchObject({ reportId: 'vr_2' });
    expect(rapport?.documentFrontFileId).toBeUndefined();
    expect(rapport?.selfieFileId).toBeUndefined();
  });

  it("rend `null` quand la session n'a pas encore de rapport", async () => {
    // `null` et non `undefined` : le paramètre par défaut avalerait le second
    // et le test éprouverait alors le rapport nominal.
    const { adapter } = monter(null);

    expect(await adapter.extractReportData('vs_1')).toBeNull();
  });
});
