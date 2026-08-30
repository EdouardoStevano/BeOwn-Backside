import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { UploadDocumentDto } from '../dto/document.dto';
import { Document } from 'src/documents/domains/document';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domains/enums/document-type.enum';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';

/**
 * Lot 11a — non-regression : un document depose avec `isPublic=false` ne doit
 * apparaitre dans AUCUNE des routes de listing public.
 *
 * Le depot est un adaptateur EN MEMOIRE (pas un mock d'appels) : le parcours
 * upload -> listing est joue de bout en bout, sans base ni reseau.
 */

class InMemoryDocumentRepository implements DocumentRepository {
  private readonly docs: Document[] = [];
  private sequence = 0;

  save(doc: Document): Promise<Document> {
    doc.id = doc.id ?? `doc-${++this.sequence}`;
    doc.createdAt = doc.createdAt ?? new Date();
    this.docs.push(doc);
    return Promise.resolve(doc);
  }

  findById(id: string): Promise<Document | null> {
    return Promise.resolve(this.docs.find((d) => d.id === id) ?? null);
  }

  findByUserId(userId: number): Promise<Document[]> {
    return Promise.resolve(this.docs.filter((d) => d.userId === userId));
  }

  findByProjectId(projectId: string): Promise<Document[]> {
    return Promise.resolve(this.docs.filter((d) => d.projectId === projectId));
  }

  findByInvestmentId(investmentId: string): Promise<Document[]> {
    return Promise.resolve(
      this.docs.filter((d) => d.investmentId === investmentId),
    );
  }

  findProjectImages(projectId: string): Promise<Document[]> {
    return Promise.resolve(
      this.docs.filter(
        (d) =>
          d.projectId === projectId && d.type === DocumentType.PHOTO_PROJET,
      ),
    );
  }

  setMainImage(id: string): Promise<Document> {
    return this.findById(id) as Promise<Document>;
  }

  updateOrdre(id: string): Promise<Document> {
    return this.findById(id) as Promise<Document>;
  }

  delete(id: string): Promise<void> {
    const index = this.docs.findIndex((d) => d.id === id);
    if (index >= 0) this.docs.splice(index, 1);
    return Promise.resolve();
  }
}

describe('DocumentController — drapeau isPublic', () => {
  const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
  const porteur: ActiveUser = {
    userId: 7,
    email: 'porteur@beown.fr',
    role: 'porteur',
  };
  const investisseur: ActiveUser = {
    userId: 99,
    email: 'investisseur@beown.fr',
    role: 'investisseur',
  };

  // ValidationPipe identique a src/main.ts : le DTO passe par la vraie chaine.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metadata = {
    type: 'body',
    metatype: UploadDocumentDto,
  } as ArgumentMetadata;

  let repository: InMemoryDocumentRepository;
  let cloudStorage: {
    upload: jest.Mock;
    getSignedUrl: jest.Mock;
    delete: jest.Mock;
  };
  let controller: DocumentController;

  const file = {
    buffer: Buffer.from('fichier'),
    originalname: 'prospectus.pdf',
    mimetype: 'application/pdf',
    size: 7,
  } as Express.Multer.File;

  const projectRepo = {
    findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID, porteurId: 7 }),
  };
  const investmentRepo = { findOne: jest.fn() };

  beforeEach(() => {
    repository = new InMemoryDocumentRepository();
    cloudStorage = {
      upload: jest.fn().mockResolvedValue({
        objectName: 'projets/prospectus.pdf',
        publicUrl: 'https://cdn.test/projets/prospectus.pdf',
      }),
      getSignedUrl: jest.fn().mockResolvedValue('https://cdn.test/signe'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    controller = new DocumentController(
      repository,
      cloudStorage as any,
      projectRepo as any,
      investmentRepo as any,
    );
  });

  /** Depose un document en passant par le ValidationPipe, comme en HTTP. */
  const uploader = async (champs: Record<string, unknown>) => {
    const dto = (await pipe.transform(
      {
        type: DocumentType.PROSPECTUS,
        relatedTo: DocumentRelatedTo.PROJECT,
        projectId: PROJECT_ID,
        ...champs,
      },
      metadata,
    )) as UploadDocumentDto;
    return controller.upload(file, dto, porteur);
  };

  it('multipart isPublic="false" : le document est enregistre PRIVE', async () => {
    const doc = await uploader({ isPublic: 'false' });

    expect(doc.isPublic).toBe(false);
  });

  it('multipart isPublic="false" : le stockage est sollicite en mode prive', async () => {
    await uploader({ isPublic: 'false' });

    // 5e argument de CloudStorageService.upload = isPublic
    expect(cloudStorage.upload).toHaveBeenCalledWith(
      file.buffer,
      file.originalname,
      file.mimetype,
      'projets',
      false,
    );
  });

  it('multipart isPublic="true" : le document reste public (appelants existants)', async () => {
    const doc = await uploader({ isPublic: 'true' });

    expect(doc.isPublic).toBe(true);
    expect(cloudStorage.upload).toHaveBeenCalledWith(
      file.buffer,
      file.originalname,
      file.mimetype,
      'projets',
      true,
    );
  });

  it('isPublic absent : le document est prive par defaut', async () => {
    const doc = await uploader({});

    expect(doc.isPublic).toBe(false);
  });

  it('multipart estPrincipale="false" : la photo n\'est pas principale', async () => {
    const doc = await uploader({
      type: DocumentType.PHOTO_PROJET,
      estPrincipale: 'false',
      ordre: '2',
    });

    expect(doc.estPrincipale).toBe(false);
    expect(doc.ordre).toBe(2);
  });

  describe('un document prive n\'est expose par aucune route publique', () => {
    beforeEach(async () => {
      await uploader({ isPublic: 'false' });
      await uploader({ type: DocumentType.PHOTO_PROJET, isPublic: 'false' });
    });

    it('GET /documents/public/project/:projectId ne le renvoie pas', async () => {
      const docs = await controller.getPublicProjectDocs(PROJECT_ID);

      expect(docs).toEqual([]);
    });

    it('GET /documents/public/project/:projectId/images ne le renvoie pas', async () => {
      const images = await controller.getProjectImages(PROJECT_ID);

      expect(images).toEqual([]);
    });

    it('GET /documents/project/:projectId ne le renvoie pas a un tiers sans droit', async () => {
      const docs = await controller.getByProject(PROJECT_ID, investisseur);

      expect(docs).toEqual([]);
    });

    it('le porteur du projet, lui, voit toujours ses documents prives', async () => {
      const docs = await controller.getByProject(PROJECT_ID, porteur);

      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.isPublic === false)).toBe(true);
    });
  });

  it('le telechargement d\'un document prive passe par une URL signee, pas par l\'URL publique', async () => {
    const doc = await uploader({ isPublic: 'false' });

    const redirection = await controller.download(doc.id, porteur);

    expect(cloudStorage.getSignedUrl).toHaveBeenCalled();
    expect(redirection.url).toBe('https://cdn.test/signe');
  });
});
