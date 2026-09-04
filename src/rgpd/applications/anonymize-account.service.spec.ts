import { AnonymizeAccountService } from 'src/rgpd/applications/anonymize-account.service';
import { RegimeAnonymisation } from 'src/rgpd/domains/retention-policy';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { DocumentType } from 'src/documents/domains/enums/document-type.enum';

/**
 * Les écritures passent par un EntityManager simulé (transaction mockée) et le
 * stockage distant par une implémentation en mémoire du port — on vérifie le
 * PÉRIMÈTRE de l'anonymisation (barème §2), le choix de régime, l'idempotence
 * et le sort de chaque catégorie de pièce.
 */
describe('AnonymizeAccountService', () => {
  const USER_ID = 42;
  let service: AnonymizeAccountService;
  let manager: any;
  let dataSource: any;
  let stockage: { delete: jest.Mock; supprimes: string[] };

  // État configurable par test.
  let user: any;
  let kycCount: number;
  let investCount: number;
  let wallets: any[];
  let txCount: number;
  let documents: any[];

  beforeEach(() => {
    user = {
      userId: USER_ID,
      firstname: 'Jean',
      lastname: 'Dupont',
      anonymiseLe: null,
      userEmail: { userId: 7, email: 'jean@example.com' },
    };
    kycCount = 0;
    investCount = 0;
    wallets = [];
    txCount = 0;
    documents = [];

    manager = {
      findOne: jest.fn(async (entity: any) =>
        entity === UserEntity ? user : null,
      ),
      find: jest.fn(async (entity: any) => {
        if (entity === DocumentEntity) return documents;
        if (entity === WalletEntity) return wallets;
        return [];
      }),
      count: jest.fn(async (entity: any) => {
        if (entity === KycEntity) return kycCount;
        if (entity === InvestmentEntity) return investCount;
        if (entity === TransactionEntity) return txCount;
        return 0;
      }),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          delete: () => qb,
          from: () => qb,
          where: jest.fn(() => qb),
          execute: jest.fn(async () => ({ affected: 1 })),
        };
        return qb;
      }),
    };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const supprimes: string[] = [];
    stockage = {
      supprimes,
      delete: jest.fn(async (objectName: string) => {
        supprimes.push(objectName);
      }),
    };

    service = new AnonymizeAccountService(dataSource, stockage as any);
  });

  const updatesFor = (entity: any) =>
    manager.update.mock.calls
      .filter((c: any) => c[0] === entity)
      .map((c: any) => ({ criteria: c[1], patch: c[2] }));

  it('utilisateur introuvable → rapport « introuvable », aucune écriture', async () => {
    user = null;
    const rapport = await service.anonymiser(USER_ID);
    expect(rapport.statut).toBe('introuvable');
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('IDEMPOTENCE : compte déjà anonymisé → no-op total', async () => {
    user.anonymiseLe = new Date('2026-01-01');
    const rapport = await service.anonymiser(USER_ID);
    expect(rapport.statut).toBe('deja_anonymise');
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
    expect(stockage.delete).not.toHaveBeenCalled();
  });

  describe('régime PURGE_TOTALE (aucune obligation)', () => {
    it("écrase l'identité, l'email, le profil complet et pose anonymiseLe", async () => {
      const rapport = await service.anonymiser(USER_ID);

      expect(rapport.statut).toBe('anonymise');
      expect(rapport.regime).toBe(RegimeAnonymisation.PURGE_TOTALE);

      const [userUpdate] = updatesFor(UserEntity);
      expect(userUpdate.criteria).toEqual({ userId: USER_ID });
      expect(userUpdate.patch).toMatchObject({
        password: null,
        socialId: null,
        firstname: '',
        lastname: null,
      });
      expect(userUpdate.patch.anonymiseLe).toBeInstanceOf(Date);
      // La preuve de consentement CGU n'est JAMAIS touchée (art. 7.1 RGPD).
      expect(userUpdate.patch).not.toHaveProperty('cguAccepteesLe');
      expect(userUpdate.patch).not.toHaveProperty('cguVersionAcceptee');
      expect(userUpdate.patch).not.toHaveProperty('cguAcceptationIp');

      const [emailUpdate] = updatesFor(UserEmailEntity);
      expect(emailUpdate.criteria).toEqual({ userId: 7 });
      expect(emailUpdate.patch).toEqual({
        email: 'supprime-42@anonymise.invalid',
      });

      const [profilUpdate] = updatesFor(ProfilPPEntity);
      expect(profilUpdate.criteria).toEqual({ utilisateurId: USER_ID });
      expect(profilUpdate.patch).toMatchObject({
        telephone: null,
        adresseLigne1: null,
        codePostal: null,
        ville: null,
        prenom: '',
        nom: '',
        dateNaissance: null,
        nationalite: null,
        nif: null,
      });

      // Préférences purgées.
      expect(manager.delete).toHaveBeenCalledWith(UserPreferencesEntity, {
        userId: USER_ID,
      });
    });

    it('détruit AUSSI les pièces de type KYC (aucune relation d’affaires née)', async () => {
      documents = [
        { id: 'd1', type: DocumentType.IDENTITE, path: 'beown/kyc/id1' },
        { id: 'd2', type: DocumentType.AUTRE, path: 'beown/docs/a1' },
      ];
      const rapport = await service.anonymiser(USER_ID);
      expect(rapport.documentsSupprimes).toBe(2);
      expect(rapport.documentsArchives).toBe(0);
      expect(stockage.supprimes).toEqual(['beown/kyc/id1', 'beown/docs/a1']);
    });
  });

  describe('régime ARCHIVAGE_RESTREINT (obligations présentes)', () => {
    it.each([
      ['KYC engagé', () => (kycCount = 1)],
      ['investissement historique', () => (investCount = 1)],
      [
        'transactions wallet',
        () => {
          wallets = [{ id: 'w1' }];
          txCount = 3;
        },
      ],
    ])("bascule en archivage dès qu'il y a %s", async (_label, setup) => {
      setup();
      const rapport = await service.anonymiser(USER_ID);
      expect(rapport.regime).toBe(RegimeAnonymisation.ARCHIVAGE_RESTREINT);
    });

    it("CONSERVE nom/prénom (L. 561-12 CMF) : l'identité n'est pas écrasée", async () => {
      kycCount = 1;
      await service.anonymiser(USER_ID);

      const [userUpdate] = updatesFor(UserEntity);
      expect(userUpdate.patch).not.toHaveProperty('firstname');
      expect(userUpdate.patch).not.toHaveProperty('lastname');
      expect(userUpdate.patch).toMatchObject({ password: null });

      const [profilUpdate] = updatesFor(ProfilPPEntity);
      // Coordonnées écrasées…
      expect(profilUpdate.patch).toMatchObject({
        telephone: null,
        adresseLigne1: null,
      });
      // …identité intacte (archivage restreint, purge à clôture + 5 ans).
      expect(profilUpdate.patch).not.toHaveProperty('nom');
      expect(profilUpdate.patch).not.toHaveProperty('prenom');
      expect(profilUpdate.patch).not.toHaveProperty('dateNaissance');
      expect(profilUpdate.patch).not.toHaveProperty('nationalite');
    });

    it('pièces KYC marquées « conservation légale », PAS détruites ; AUTRE supprimée ; contrat intact', async () => {
      kycCount = 1;
      documents = [
        {
          id: 'kyc1',
          type: DocumentType.IDENTITE,
          path: 'beown/kyc/id1',
          archiveConservationLegale: false,
        },
        {
          id: 'kyc2',
          type: DocumentType.JUSTIFICATIF_DOMICILE,
          path: 'beown/kyc/jd1',
          archiveConservationLegale: false,
        },
        { id: 'a1', type: DocumentType.AUTRE, path: 'beown/docs/a1' },
        {
          id: 'c1',
          type: DocumentType.CONTRAT_SOUSCRIPTION,
          path: 'beown/contrats/c1',
        },
      ];

      const rapport = await service.anonymiser(USER_ID);

      expect(rapport.documentsArchives).toBe(2);
      expect(rapport.documentsSupprimes).toBe(1);
      // Seule la pièce AUTRE part chez le fournisseur de stockage.
      expect(stockage.supprimes).toEqual(['beown/docs/a1']);
      // Le contrat n'est ni supprimé ni marqué.
      const deletedIds = manager.delete.mock.calls
        .filter((c: any) => c[0] === DocumentEntity)
        .map((c: any) => c[1].id);
      expect(deletedIds).toEqual(['a1']);
      const archived = updatesFor(DocumentEntity).map((u: any) => u.criteria.id);
      expect(archived).toEqual(['kyc1', 'kyc2']);
    });

    it('rejouabilité des pièces : une pièce déjà archivée n’est pas re-marquée', async () => {
      kycCount = 1;
      documents = [
        {
          id: 'kyc1',
          type: DocumentType.IDENTITE,
          path: 'beown/kyc/id1',
          archiveConservationLegale: true,
        },
      ];
      const rapport = await service.anonymiser(USER_ID);
      expect(rapport.documentsArchives).toBe(0);
      expect(updatesFor(DocumentEntity)).toHaveLength(0);
    });
  });

  it('un chemin http (pièce publique historique) n’est pas envoyé au port de stockage', async () => {
    documents = [
      {
        id: 'p1',
        type: DocumentType.AUTRE,
        path: 'https://cdn.example.com/x.jpg',
      },
    ];
    const rapport = await service.anonymiser(USER_ID);
    expect(rapport.documentsSupprimes).toBe(1);
    expect(stockage.delete).not.toHaveBeenCalled();
  });

  it('les écritures base vivent dans UNE transaction ; le stockage distant est appelé après', async () => {
    documents = [{ id: 'a1', type: DocumentType.AUTRE, path: 'beown/docs/a1' }];
    let deleteCalledInsideTx = false;
    dataSource.transaction = jest.fn(async (cb: any) => {
      const result = await cb(manager);
      deleteCalledInsideTx = stockage.delete.mock.calls.length > 0;
      return result;
    });
    await service.anonymiser(USER_ID);
    expect(deleteCalledInsideTx).toBe(false);
    expect(stockage.delete).toHaveBeenCalledWith('beown/docs/a1');
  });
});
