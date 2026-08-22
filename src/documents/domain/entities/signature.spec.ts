import { Signature, type SignatureSnapshot } from './signature';
import { SignatureStatus } from '../enums/signature-status.enum';
import {
  AnnulationReserveeAuSignataireError,
  SignatureNonModifiableError,
} from '../errors';

const SIGNATAIRE = 7;
const LE_15 = new Date('2026-08-15T10:00:00Z');
const LE_20 = new Date('2026-08-20T10:00:00Z');

const signature = (etat: Partial<SignatureSnapshot> = {}) =>
  new Signature({
    id: 'sig-1',
    youSignRequestId: 'ys-req-1',
    youSignSignerId: 'ys-signer-1',
    youSignSigningUrl: 'https://yousign.test/sign/1',
    documentId: 'doc-1',
    investmentId: 'inv-1',
    ordreId: null,
    nbFractions: 3,
    userId: SIGNATAIRE,
    statut: SignatureStatus.PENDING,
    expiresAt: LE_20,
    signedAt: null,
    createdAt: LE_15,
    ...etat,
  });

describe('Signature — ouverture de la demande', () => {
  const demande = {
    youSignRequestId: 'ys-req-1',
    youSignSignerId: 'ys-signer-1',
    youSignSigningUrl: 'https://yousign.test/sign/1',
    documentId: 'doc-1',
    investmentId: 'inv-1',
    ordreId: null,
    nbFractions: 3,
    userId: SIGNATAIRE,
    expiresAt: LE_20,
  };

  it('naît en attente, sans date de signature', () => {
    const naissante = Signature.demander(demande);

    expect(naissante.statut).toBe(SignatureStatus.PENDING);
    expect(naissante.signedAt).toBeNull();
  });
});

describe('Signature — signer', () => {
  it('fige le statut et la date de signature', () => {
    const s = signature();

    s.signer(LE_15);

    expect(s.estSignee).toBe(true);
    expect(s.signedAt).toEqual(LE_15);
  });

  it('refuse un second passage — le webhook rejoué ne resigne rien', () => {
    const s = signature();

    s.signer(LE_15);

    expect(() => s.signer(LE_20)).toThrow(SignatureNonModifiableError);
  });

  it('ne réécrit pas la date de signature quand elle refuse', () => {
    const s = signature();

    s.signer(LE_15);
    expect(() => s.signer(LE_20)).toThrow();

    expect(s.signedAt).toEqual(LE_15);
  });

  it('refuse de signer une demande annulée', () => {
    const s = signature({ statut: SignatureStatus.CANCELLED });

    expect(() => s.signer()).toThrow(SignatureNonModifiableError);
  });

  it('refuse de signer une demande expirée', () => {
    const s = signature({ statut: SignatureStatus.EXPIRED });

    expect(() => s.signer()).toThrow(SignatureNonModifiableError);
  });
});

describe('Signature — annuler', () => {
  it('retire la demande à l’initiative du signataire', () => {
    const s = signature();

    s.annuler(SIGNATAIRE);

    expect(s.statut).toBe(SignatureStatus.CANCELLED);
  });

  it('refuse l’annulation à quelqu’un d’autre', () => {
    const s = signature();

    expect(() => s.annuler(99)).toThrow(AnnulationReserveeAuSignataireError);
  });

  it('refuse d’annuler une demande déjà signée', () => {
    const s = signature({ statut: SignatureStatus.SIGNED });

    expect(() => s.annuler(SIGNATAIRE)).toThrow(SignatureNonModifiableError);
  });

  it('vérifie le signataire avant l’état — un tiers n’apprend rien du statut', () => {
    const s = signature({ statut: SignatureStatus.SIGNED });

    expect(() => s.annuler(99)).toThrow(AnnulationReserveeAuSignataireError);
  });
});

describe('Signature — expirer', () => {
  it('fait tomber une demande encore en attente', () => {
    const s = signature();

    s.expirer();

    expect(s.statut).toBe(SignatureStatus.EXPIRED);
  });

  it('n’expire pas une demande déjà signée', () => {
    const s = signature({ statut: SignatureStatus.SIGNED });

    expect(() => s.expirer()).toThrow(SignatureNonModifiableError);
  });

  it('dit quand la demande a dépassé son délai', () => {
    const s = signature();

    expect(s.estEchue(new Date('2026-08-19T10:00:00Z'))).toBe(false);
    expect(s.estEchue(new Date('2026-08-21T10:00:00Z'))).toBe(true);
  });

  it('ne tient pas pour échue une demande déjà actée', () => {
    const s = signature({ statut: SignatureStatus.SIGNED });

    expect(s.estEchue(new Date('2026-09-01T00:00:00Z'))).toBe(false);
  });
});

describe('Signature — ce qu’elle engage', () => {
  it('distingue une cession d’une souscription primaire', () => {
    expect(signature({ ordreId: 'ord-1' }).concerneUneCession).toBe(true);
    expect(signature({ ordreId: null }).concerneUneCession).toBe(false);
  });
});
