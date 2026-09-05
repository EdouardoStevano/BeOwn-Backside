import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { Document } from 'src/documents/domains/document';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domains/enums/document-type.enum';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Matrice d'accès aux PIÈCES du dossier KYC, par rôle réel de la plateforme.
 *
 * Anomalie corrigée : les pièces d'identité, selfies et justificatifs de
 * domicile d'un compte quelconque étaient lisibles — et téléchargeables via une
 * URL signée — par tout détenteur de `users:read` (support, marketing, chargé
 * de relation investisseur, dpo) ou de `data:export` (marketing, dpo). Et le
 * marqueur `archiveConservationLegale`, posé par l'anonymisation sur le dossier
 * KYC d'un compte SUPPRIMÉ que la loi impose de garder cinq ans, n'était filtré
 * par AUCUNE lecture : l'« archivage restreint » du barème n'existait qu'en
 * base.
 *
 * Les rôles ne sont pas simulés : les tests interrogent la VRAIE matrice
 * `ROLE_PERMISSIONS`. Un rôle qui gagnerait demain `users:read` sans
 * `kyc:read_documents` sera couvert par construction.
 */

const OWNER_ID = 100;

class DepotDocuments implements DocumentRepository {
  constructor(private readonly docs: Document[]) {}

  save(doc: Document): Promise<Document> {
    this.docs.push(doc);
    return Promise.resolve(doc);
  }
  findById(id: string): Promise<Document | null> {
    return Promise.resolve(this.docs.find((d) => d.id === id) ?? null);
  }
  findByUserId(userId: number): Promise<Document[]> {
    return Promise.resolve(this.docs.filter((d) => d.userId === userId));
  }
  findByProjectId(): Promise<Document[]> {
    return Promise.resolve([]);
  }
  findByInvestmentId(): Promise<Document[]> {
    return Promise.resolve([]);
  }
  findProjectImages(): Promise<Document[]> {
    return Promise.resolve([]);
  }
  setMainImage(id: string): Promise<Document> {
    return this.findById(id) as Promise<Document>;
  }
  updateOrdre(id: string): Promise<Document> {
    return this.findById(id) as Promise<Document>;
  }
  delete(id: string): Promise<void> {
    const i = this.docs.findIndex((d) => d.id === id);
    if (i >= 0) this.docs.splice(i, 1);
    return Promise.resolve();
  }
}

const piece = (champs: Partial<Document>): Document =>
  Object.assign(new Document(), {
    id: 'sans-id',
    type: DocumentType.IDENTITE,
    relatedTo: DocumentRelatedTo.USER,
    userId: OWNER_ID,
    projectId: null,
    investmentId: null,
    originalName: 'piece.pdf',
    filename: 'beown/kyc/piece',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    path: 'beown/kyc/piece',
    isPublic: false,
    // Déposée par le titulaire lui-même : le raccourci « c'est moi qui l'ai
    // téléversée » ne peut donc pas expliquer un accès accordé à un tiers.
    uploadedBy: OWNER_ID,
    ordre: null,
    estPrincipale: false,
    archiveConservationLegale: false,
    createdAt: new Date('2026-01-01'),
  } satisfies Document,
  champs);

const acteur = (role: UserRole | string, userId = 500): ActiveUser => ({
  userId,
  email: `${role}@beown.fr`,
  role: role as ActiveUser['role'],
});

describe('DocumentController — accès aux pièces KYC', () => {
  let cloudStorage: { getSignedUrl: jest.Mock; delete: jest.Mock };

  const controllerAvec = (docs: Document[]) => {
    cloudStorage = {
      getSignedUrl: jest.fn().mockResolvedValue('https://cdn.test/signe'),
      delete: jest.fn().mockResolvedValue(true),
    };
    return new DocumentController(
      new DepotDocuments(docs),
      cloudStorage as any,
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
    );
  };

  // ── Lecture d'une pièce KYC courante ──────────────────────────────────────

  describe('pièce KYC courante (compte vivant)', () => {
    /**
     * Ces quatre rôles détiennent `users:read` et/ou `data:export` : ils
     * accédaient tous à la pièce d'identité. Aucun n'a de mission qui l'exige.
     */
    it.each([
      [UserRole.SUPPORT],
      [UserRole.MARKETING],
      [UserRole.CHARGE_RELATION_INVESTISSEUR],
      [UserRole.DPO],
    ])('%s : ne peut plus ouvrir la pièce d’identité d’un tiers', async (role) => {
      const doc = piece({ id: 'kyc1' });
      const controller = controllerAvec([doc]);

      await expect(controller.findOne('kyc1', acteur(role))).rejects.toThrow(
        NotFoundException,
      );
      // Ni par le détour du téléchargement : aucune URL signée n'est émise.
      await expect(controller.download('kyc1', acteur(role))).rejects.toThrow(
        NotFoundException,
      );
      expect(cloudStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('compliance : lit la pièce et obtient son URL signée', async () => {
      const controller = controllerAvec([piece({ id: 'kyc1' })]);
      const acteurCompliance = acteur(UserRole.COMPLIANCE);

      await expect(
        controller.findOne('kyc1', acteurCompliance),
      ).resolves.toMatchObject({ id: 'kyc1' });
      await expect(
        controller.download('kyc1', acteurCompliance),
      ).resolves.toEqual({ url: 'https://cdn.test/signe' });
    });

    it('super_admin : le joker de la matrice donne accès', async () => {
      const controller = controllerAvec([piece({ id: 'kyc1' })]);
      await expect(
        controller.findOne('kyc1', acteur(UserRole.SUPER_ADMIN)),
      ).resolves.toMatchObject({ id: 'kyc1' });
    });

    it('le titulaire garde l’accès à sa propre pièce', async () => {
      const controller = controllerAvec([piece({ id: 'kyc1' })]);
      await expect(
        controller.findOne('kyc1', acteur(UserRole.INVESTISSEUR, OWNER_ID)),
      ).resolves.toMatchObject({ id: 'kyc1' });
    });

    it('un investisseur tiers ne voit rien, comme avant', async () => {
      const controller = controllerAvec([piece({ id: 'kyc1' })]);
      await expect(
        controller.findOne('kyc1', acteur(UserRole.INVESTISSEUR, 999)),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * La restriction porte sur les pièces KYC, pas sur tout le dossier : une
     * pièce sans obligation reste consultable par les rôles d'annuaire, sinon
     * l'assistance ne pourrait plus faire son travail.
     */
    it('une pièce NON-KYC reste lisible par le support', async () => {
      const controller = controllerAvec([
        piece({ id: 'autre', type: DocumentType.AUTRE }),
      ]);
      await expect(
        controller.findOne('autre', acteur(UserRole.SUPPORT)),
      ).resolves.toMatchObject({ id: 'autre' });
    });
  });

  // ── Archivage restreint (compte supprimé, conservation légale) ────────────

  describe('pièce en archivage de conservation légale', () => {
    it('compliance seul y accède — le marqueur est enfin opposable', async () => {
      const controller = controllerAvec([
        piece({ id: 'arch', archiveConservationLegale: true }),
      ]);

      await expect(
        controller.findOne('arch', acteur(UserRole.COMPLIANCE)),
      ).resolves.toMatchObject({ id: 'arch' });

      for (const role of [
        UserRole.SUPPORT,
        UserRole.MARKETING,
        UserRole.DPO,
        UserRole.CHARGE_RELATION_INVESTISSEUR,
        UserRole.RCCI,
      ]) {
        await expect(
          controller.findOne('arch', acteur(role)),
        ).rejects.toThrow(NotFoundException);
      }
    });

    it("même le titulaire de la pièce n'y accède pas : elle est hors des écrans courants", async () => {
      const controller = controllerAvec([
        piece({ id: 'arch', archiveConservationLegale: true }),
      ]);
      await expect(
        controller.findOne('arch', acteur(UserRole.INVESTISSEUR, OWNER_ID)),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * Conservation IMPOSÉE cinq ans (art. L. 561-12 CMF) : sa seule voie de
     * sortie est le cron de purge RGPD. `users:manage` et `kyc:validate`
     * suffisaient pourtant à la détruire.
     */
    it('nul ne peut la supprimer, pas même la conformité', async () => {
      const controller = controllerAvec([
        piece({ id: 'arch', archiveConservationLegale: true }),
      ]);
      for (const role of [UserRole.COMPLIANCE, UserRole.SUPER_ADMIN]) {
        await expect(controller.remove('arch', acteur(role))).rejects.toThrow(
          ForbiddenException,
        );
      }
      expect(cloudStorage.delete).not.toHaveBeenCalled();
    });
  });

  // ── Listes : le filtrage se fait pièce par pièce ──────────────────────────

  describe('GET /documents/user/:userId', () => {
    const dossier = () => [
      piece({ id: 'kyc1', type: DocumentType.IDENTITE }),
      piece({ id: 'kyc2', type: DocumentType.SELFIE }),
      piece({ id: 'autre', type: DocumentType.AUTRE }),
      piece({
        id: 'arch',
        type: DocumentType.JUSTIFICATIF_DOMICILE,
        archiveConservationLegale: true,
      }),
    ];

    it('support : la liste ne contient plus que les pièces non-KYC', async () => {
      const controller = controllerAvec(dossier());
      const docs = await controller.getByUser(OWNER_ID, acteur(UserRole.SUPPORT));
      expect(docs.map((d) => d.id)).toEqual(['autre']);
    });

    it('compliance : dossier complet, archive comprise', async () => {
      const controller = controllerAvec(dossier());
      const docs = await controller.getByUser(
        OWNER_ID,
        acteur(UserRole.COMPLIANCE),
      );
      expect(docs.map((d) => d.id).sort()).toEqual([
        'arch',
        'autre',
        'kyc1',
        'kyc2',
      ]);
    });

    it('un investisseur tiers reste refusé d’entrée (403)', async () => {
      const controller = controllerAvec(dossier());
      await expect(
        controller.getByUser(OWNER_ID, acteur(UserRole.INVESTISSEUR, 999)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('GET /documents/me n’expose pas les pièces archivées', async () => {
      const controller = controllerAvec(dossier());
      const docs = await controller.getMyDocuments(
        acteur(UserRole.INVESTISSEUR, OWNER_ID),
      );
      expect(docs.map((d) => d.id)).not.toContain('arch');
      expect(docs).toHaveLength(3);
    });
  });
});
