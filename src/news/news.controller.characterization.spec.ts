import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminNewsController, PublicNewsController } from './news.controller';
import { NewsStatus } from './news.entity';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

/**
 * Tests de CARACTÉRISATION de PublicNewsController + AdminNewsController
 * (lot 1 du refactor hexagonal du module `news`).
 *
 * But : figer le comportement observable des 8 endpoints AVANT d'extraire
 * la logique du contrôleur vers des usecases. Le dépôt n'étant pas sous git,
 * ce fichier est le SEUL filet de sécurité du refactor : chaque assertion
 * porte sur le corps exact renvoyé, le type d'exception et son message exact,
 * ainsi que sur les arguments passés aux dépendances (repos, cloud storage).
 *
 * Les contrôleurs sont instanciés à la main avec des dépendances `jest.fn()` ;
 * après extraction des usecases ces tests doivent rester verts sans être
 * modifiés (le contrôleur se contentera de déléguer).
 *
 * Endpoints couverts :
 *  public  : listPublic, detailPublic
 *  admin   : upload, list, detail, create, update, remove  (+ garde ensureAdmin)
 *
 * NB : la logique de slug/publishedAt/imageUrls est figée telle quelle,
 * y compris ses bizarreries (slug de repli `news-<timestamp>` décimal,
 * suffixe de collision `-<base36>`, `imageUrls: []` ⇒ `imageUrl: null`).
 * Caractérisation ≠ approbation.
 */

const ADMIN_ROLES = rolesWithPermission('news:manage');
const ADMIN_ROLE = ADMIN_ROLES[0];
/** Rôle authentifié mais dépourvu de la permission `news:manage`. */
const OUTSIDER_ROLE = UserRole.INVESTISSEUR;

/** Horloge figée : `new Date()` et `Date.now()` deviennent déterministes. */
const FIXED_ISO = '2026-03-01T12:00:00.000Z';
const FIXED_MS = new Date(FIXED_ISO).getTime();

/** Query builder TypeORM chaînable minimal. */
const makeQb = (rows: any[] = []) => {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn(async () => rows),
  };
  return qb;
};

// ────────────────────────────────────────────────────────────────────────────
// PublicNewsController
// ────────────────────────────────────────────────────────────────────────────
describe('PublicNewsController — caractérisation (lot 1)', () => {
  let newsRepo: any;
  let controller: PublicNewsController;

  beforeEach(() => {
    newsRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    controller = new PublicNewsController(newsRepo);
  });

  describe('listPublic', () => {
    it('filtre sur statut publié, trie par publishedAt DESC et renvoie getMany()', async () => {
      const rows = [{ id: 'a' }, { id: 'b' }];
      const qb = makeQb(rows);
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await controller.listPublic();

      expect(newsRepo.createQueryBuilder).toHaveBeenCalledWith('n');
      expect(qb.where).toHaveBeenCalledWith('n.statut = :s', {
        s: NewsStatus.PUBLISHED,
      });
      expect(qb.orderBy).toHaveBeenCalledWith('n.publishedAt', 'DESC');
      expect(res).toBe(rows);
    });

    it('limit absent → take(20)', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic();

      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('limit non numérique ("abc") → take(20)', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic('abc');

      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('limit "500" → plafonné à take(100)', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic('500');

      expect(qb.take).toHaveBeenCalledWith(100);
    });

    it('limit "0" → take(20) (0 est falsy, le défaut s’applique)', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic('0');

      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('limit "7" → take(7)', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic('7');

      expect(qb.take).toHaveBeenCalledWith(7);
    });

    it('sans category : aucun andWhere', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic('20');

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('avec category : andWhere sur n.category', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic('20', 'marche');

      expect(qb.andWhere).toHaveBeenCalledWith('n.category = :c', {
        c: 'marche',
      });
    });

    it('category chaîne vide : traitée comme absente (aucun andWhere)', async () => {
      const qb = makeQb();
      newsRepo.createQueryBuilder.mockReturnValue(qb);

      await controller.listPublic('20', '');

      expect(qb.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('detailPublic', () => {
    it('renvoie l’entité trouvée et ne cherche que parmi les publiées', async () => {
      const entity = { id: 'n1', slug: 'mon-actu' };
      newsRepo.findOne.mockResolvedValue(entity);

      const res = await controller.detailPublic('mon-actu');

      expect(newsRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'mon-actu', statut: NewsStatus.PUBLISHED },
      });
      expect(res).toBe(entity);
    });

    it('404 « Actualité introuvable. » si aucune actualité publiée pour ce slug', async () => {
      newsRepo.findOne.mockResolvedValue(null);

      await expect(controller.detailPublic('absent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(controller.detailPublic('absent')).rejects.toThrow(
        'Actualité introuvable.',
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AdminNewsController
// ────────────────────────────────────────────────────────────────────────────
describe('AdminNewsController — caractérisation (lot 1)', () => {
  let userRepo: any;
  let newsRepo: any;
  let cloudStorage: any;
  let controller: AdminNewsController;

  const admin = { userId: 42, email: 'admin@beown.fr', role: ADMIN_ROLE } as any;
  const adminRow = { userId: 42, role: ADMIN_ROLE };

  const file = () =>
    ({
      buffer: Buffer.from('binaire'),
      originalname: 'cover.png',
      mimetype: 'image/png',
    }) as any;

  beforeEach(() => {
    userRepo = { findOne: jest.fn().mockResolvedValue(adminRow) };
    newsRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: 'saved-id', ...x })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    cloudStorage = {
      upload: jest
        .fn()
        .mockResolvedValue({ objectName: 'oid', publicUrl: 'https://cdn/x.png' }),
    };
    controller = new AdminNewsController(userRepo, newsRepo, cloudStorage);
  });

  // ── ensureAdmin (garde commune) ───────────────────────────────────────────
  describe('ensureAdmin', () => {
    it('charge l’utilisateur par userId issu du token', async () => {
      await controller.list(admin);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 42 },
      });
    });

    it('rôles autorisés = rolesWithPermission("news:manage")', () => {
      // Garde-fou : si la matrice de permissions change, ce test le signale.
      expect(ADMIN_ROLES).toEqual([
        UserRole.SUPER_ADMIN,
        UserRole.ANALYSTE_FINANCIER,
        UserRole.SUPPORT,
      ]);
      expect(ADMIN_ROLES).not.toContain(OUTSIDER_ROLE);
    });

    // Les 6 endpoints admin appellent tous ensureAdmin en premier.
    const endpoints: Array<[string, (c: AdminNewsController) => Promise<any>]> = [
      ['upload', (c) => c.upload(file(), admin)],
      ['list', (c) => c.list(admin)],
      ['detail', (c) => c.detail('n1', admin)],
      [
        'create',
        (c) => c.create({ titreFr: 'T', contenuFr: 'C' } as any, admin),
      ],
      ['update', (c) => c.update('n1', { titreFr: 'T' } as any, admin)],
      ['remove', (c) => c.remove('n1', admin)],
    ];

    describe.each(endpoints)('%s', (_name, call) => {
      it('403 ForbiddenException si l’utilisateur est introuvable en base', async () => {
        userRepo.findOne.mockResolvedValue(null);

        await expect(call(controller)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      });

      it('403 ForbiddenException si le rôle n’a pas la permission news:manage', async () => {
        userRepo.findOne.mockResolvedValue({
          userId: 42,
          role: OUTSIDER_ROLE,
        });

        await expect(call(controller)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      });

      it('n’atteint aucune dépendance métier quand la garde rejette', async () => {
        userRepo.findOne.mockResolvedValue(null);

        await expect(call(controller)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(cloudStorage.upload).not.toHaveBeenCalled();
        expect(newsRepo.find).not.toHaveBeenCalled();
        expect(newsRepo.findOne).not.toHaveBeenCalled();
        expect(newsRepo.save).not.toHaveBeenCalled();
        expect(newsRepo.update).not.toHaveBeenCalled();
        expect(newsRepo.delete).not.toHaveBeenCalled();
      });
    });

    it('message exact de la ForbiddenException : "Forbidden"', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(controller.list(admin)).rejects.toThrow('Forbidden');
    });
  });

  // ── upload ────────────────────────────────────────────────────────────────
  describe('upload', () => {
    it('400 « Fichier manquant. » si aucun fichier', async () => {
      await expect(controller.upload(undefined as any, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.upload(undefined as any, admin)).rejects.toThrow(
        'Fichier manquant.',
      );
      expect(cloudStorage.upload).not.toHaveBeenCalled();
    });

    it('la garde admin passe AVANT le contrôle du fichier (403 prioritaire sur 400)', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.upload(undefined as any, admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('succès : renvoie { url: publicUrl }', async () => {
      const res = await controller.upload(file(), admin);

      expect(res).toEqual({ url: 'https://cdn/x.png' });
    });

    it('appelle cloudStorage.upload avec exactement 4 arguments (buffer, nom, mime, "news")', async () => {
      const f = file();

      await controller.upload(f, admin);

      expect(cloudStorage.upload).toHaveBeenCalledWith(
        f.buffer,
        'cover.png',
        'image/png',
        'news',
      );
      // Le 5e paramètre `isPublic` n'est PAS transmis : il reste au défaut du
      // service (false). À figer explicitement — le refactor ne doit pas
      // « corriger » ce point sans décision produit.
      expect(cloudStorage.upload.mock.calls[0]).toHaveLength(4);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────
  describe('list', () => {
    it('renvoie find({ order: { updatedAt: "DESC" } })', async () => {
      const rows = [{ id: 'a' }];
      newsRepo.find.mockResolvedValue(rows);

      const res = await controller.list(admin);

      expect(newsRepo.find).toHaveBeenCalledWith({
        order: { updatedAt: 'DESC' },
      });
      expect(res).toBe(rows);
    });
  });

  // ── detail ────────────────────────────────────────────────────────────────
  describe('detail', () => {
    it('renvoie l’entité trouvée par id (sans filtre de statut)', async () => {
      const entity = { id: 'n1', statut: NewsStatus.DRAFT };
      newsRepo.findOne.mockResolvedValue(entity);

      const res = await controller.detail('n1', admin);

      expect(newsRepo.findOne).toHaveBeenCalledWith({ where: { id: 'n1' } });
      expect(res).toBe(entity);
    });

    it('404 SANS message métier (message par défaut "Not Found")', async () => {
      newsRepo.findOne.mockResolvedValue(null);

      await expect(controller.detail('absent', admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(controller.detail('absent', admin)).rejects.toThrow(
        'Not Found',
      );
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe('create', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: FIXED_MS });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    /** Payload passé à newsRepo.create(). */
    const created = () => newsRepo.create.mock.calls[0][0];

    it('slug dérivé du titre : minuscules, accents supprimés, séparateurs normalisés', async () => {
      await controller.create(
        { titreFr: 'Événement à Nîmes : l’Été 2026 !', contenuFr: 'C' } as any,
        admin,
      );

      expect(created().slug).toBe('evenement-a-nimes-l-ete-2026');
    });

    it('slug tronqué à 80 caractères', async () => {
      await controller.create(
        { titreFr: 'a'.repeat(120), contenuFr: 'C' } as any,
        admin,
      );

      expect(created().slug).toBe('a'.repeat(80));
      expect(created().slug).toHaveLength(80);
    });

    it('titre sans caractère alphanumérique → slug de repli "news-<timestamp décimal>"', async () => {
      await controller.create({ titreFr: '!!! ??? ---', contenuFr: 'C' } as any, admin);

      expect(created().slug).toBe(`news-${FIXED_MS}`);
    });

    it('dto.slug est prioritaire sur le titre', async () => {
      await controller.create(
        { titreFr: 'Un Titre', contenuFr: 'C', slug: 'slug-impose' } as any,
        admin,
      );

      expect(newsRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'slug-impose' },
      });
      expect(created().slug).toBe('slug-impose');
    });

    it('collision de slug → suffixe "-<Date.now() en base36>"', async () => {
      newsRepo.findOne.mockResolvedValue({ id: 'deja-la', slug: 'un-titre' });

      await controller.create({ titreFr: 'Un Titre', contenuFr: 'C' } as any, admin);

      expect(created().slug).toBe(`un-titre-${FIXED_MS.toString(36)}`);
    });

    it('imageUrl seul → imageUrls = [imageUrl]', async () => {
      await controller.create(
        { titreFr: 'T', contenuFr: 'C', imageUrl: 'https://a/1.png' } as any,
        admin,
      );

      expect(created().imageUrl).toBe('https://a/1.png');
      expect(created().imageUrls).toEqual(['https://a/1.png']);
    });

    it('imageUrls seul → imageUrl = imageUrls[0]', async () => {
      await controller.create(
        {
          titreFr: 'T',
          contenuFr: 'C',
          imageUrls: ['https://a/1.png', 'https://a/2.png'],
        } as any,
        admin,
      );

      expect(created().imageUrl).toBe('https://a/1.png');
      expect(created().imageUrls).toEqual([
        'https://a/1.png',
        'https://a/2.png',
      ]);
    });

    it('imageUrls = [] → imageUrl = null', async () => {
      await controller.create(
        { titreFr: 'T', contenuFr: 'C', imageUrls: [] } as any,
        admin,
      );

      expect(created().imageUrl).toBeNull();
      expect(created().imageUrls).toEqual([]);
    });

    it('aucune image → imageUrl null et imageUrls []', async () => {
      await controller.create({ titreFr: 'T', contenuFr: 'C' } as any, admin);

      expect(created().imageUrl).toBeNull();
      expect(created().imageUrls).toEqual([]);
    });

    it('imageUrl ET imageUrls fournis → imageUrl gagne, imageUrls conservé tel quel', async () => {
      await controller.create(
        {
          titreFr: 'T',
          contenuFr: 'C',
          imageUrl: 'https://hero.png',
          imageUrls: ['https://a.png'],
        } as any,
        admin,
      );

      expect(created().imageUrl).toBe('https://hero.png');
      expect(created().imageUrls).toEqual(['https://a.png']);
    });

    it('statut par défaut DRAFT et publishedAt null si non publié', async () => {
      await controller.create({ titreFr: 'T', contenuFr: 'C' } as any, admin);

      expect(created().statut).toBe(NewsStatus.DRAFT);
      expect(created().publishedAt).toBeNull();
    });

    it('statut ARCHIVED → publishedAt null', async () => {
      await controller.create(
        { titreFr: 'T', contenuFr: 'C', statut: NewsStatus.ARCHIVED } as any,
        admin,
      );

      expect(created().statut).toBe(NewsStatus.ARCHIVED);
      expect(created().publishedAt).toBeNull();
    });

    it('publié sans date → publishedAt = maintenant', async () => {
      await controller.create(
        { titreFr: 'T', contenuFr: 'C', statut: NewsStatus.PUBLISHED } as any,
        admin,
      );

      expect(created().publishedAt).toEqual(new Date(FIXED_ISO));
    });

    it('publié avec date → publishedAt = new Date(dto.publishedAt)', async () => {
      await controller.create(
        {
          titreFr: 'T',
          contenuFr: 'C',
          statut: NewsStatus.PUBLISHED,
          publishedAt: '2026-05-01T00:00:00.000Z',
        } as any,
        admin,
      );

      expect(created().publishedAt).toEqual(
        new Date('2026-05-01T00:00:00.000Z'),
      );
    });

    it('publishedAt fourni mais statut DRAFT → publishedAt écrasé à null', async () => {
      await controller.create(
        {
          titreFr: 'T',
          contenuFr: 'C',
          publishedAt: '2026-05-01T00:00:00.000Z',
        } as any,
        admin,
      );

      expect(created().publishedAt).toBeNull();
    });

    it('authorId provient de l’entité utilisateur chargée en base, pas du token', async () => {
      // Le token porte userId 42, la ligne en base renvoie 99 : c'est 99 qui
      // est écrit. Distinction importante pour le refactor.
      userRepo.findOne.mockResolvedValue({ userId: 99, role: ADMIN_ROLE });

      await controller.create({ titreFr: 'T', contenuFr: 'C' } as any, admin);

      expect(created().authorId).toBe(99);
    });

    it('recopie les champs du dto et renvoie le résultat de save()', async () => {
      const saved = { id: 'saved-id' };
      newsRepo.save.mockResolvedValue(saved);

      const res = await controller.create(
        {
          titreFr: 'Titre FR',
          titreEn: 'Title EN',
          contenuFr: '<p>FR</p>',
          contenuEn: '<p>EN</p>',
          resumeFr: 'rFR',
          resumeEn: 'rEN',
          category: 'marche',
        } as any,
        admin,
      );

      expect(created()).toEqual({
        titreFr: 'Titre FR',
        titreEn: 'Title EN',
        contenuFr: '<p>FR</p>',
        contenuEn: '<p>EN</p>',
        resumeFr: 'rFR',
        resumeEn: 'rEN',
        category: 'marche',
        imageUrl: null,
        imageUrls: [],
        slug: 'titre-fr',
        authorId: 42,
        publishedAt: null,
        statut: NewsStatus.DRAFT,
      });
      expect(newsRepo.save).toHaveBeenCalledWith(created());
      expect(res).toBe(saved);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────
  describe('update', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: FIXED_MS });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    const existing = (over: any = {}) => ({
      id: 'n1',
      titreFr: 'Ancien Titre',
      slug: 'ancien-titre',
      statut: NewsStatus.DRAFT,
      publishedAt: null,
      imageUrl: null,
      imageUrls: [],
      ...over,
    });

    /** Patch effectivement passé à newsRepo.update(). */
    const patch = () => newsRepo.update.mock.calls[0][1];

    const arrange = (row: any, reread: any = { id: 'n1', relu: true }) => {
      newsRepo.findOne
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(reread);
    };

    it('404 (message par défaut) si l’actualité n’existe pas', async () => {
      newsRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.update('absent', { titreFr: 'X' } as any, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(newsRepo.update).not.toHaveBeenCalled();
    });

    it('relit l’entité après update et renvoie la relecture', async () => {
      const reread = { id: 'n1', titreFr: 'Nouveau' };
      arrange(existing(), reread);

      const res = await controller.update(
        'n1',
        { contenuFr: 'maj' } as any,
        admin,
      );

      expect(newsRepo.update).toHaveBeenCalledWith(
        { id: 'n1' },
        expect.objectContaining({ contenuFr: 'maj' }),
      );
      expect(newsRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 'n1' },
      });
      expect(res).toBe(reread);
    });

    it('DRAFT → PUBLISHED sans publishedAt : publishedAt = maintenant', async () => {
      arrange(existing({ statut: NewsStatus.DRAFT }));

      await controller.update(
        'n1',
        { statut: NewsStatus.PUBLISHED } as any,
        admin,
      );

      expect(patch().publishedAt).toEqual(new Date(FIXED_ISO));
    });

    it('DRAFT → PUBLISHED avec publishedAt : la date fournie l’emporte', async () => {
      arrange(existing({ statut: NewsStatus.DRAFT }));

      await controller.update(
        'n1',
        {
          statut: NewsStatus.PUBLISHED,
          publishedAt: '2026-05-01T00:00:00.000Z',
        } as any,
        admin,
      );

      expect(patch().publishedAt).toEqual(new Date('2026-05-01T00:00:00.000Z'));
    });

    it('déjà PUBLISHED, simple édition : publishedAt absent du patch', async () => {
      arrange(existing({ statut: NewsStatus.PUBLISHED }));

      await controller.update('n1', { contenuFr: 'maj' } as any, admin);

      expect('publishedAt' in patch()).toBe(false);
    });

    it('PUBLISHED → DRAFT : publishedAt absent du patch (non remis à null)', async () => {
      arrange(
        existing({
          statut: NewsStatus.PUBLISHED,
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      await controller.update('n1', { statut: NewsStatus.DRAFT } as any, admin);

      expect('publishedAt' in patch()).toBe(false);
    });

    it('déjà PUBLISHED avec publishedAt fourni : date convertie en Date', async () => {
      arrange(existing({ statut: NewsStatus.PUBLISHED }));

      await controller.update(
        'n1',
        { publishedAt: '2026-06-15T08:30:00.000Z' } as any,
        admin,
      );

      expect(patch().publishedAt).toEqual(new Date('2026-06-15T08:30:00.000Z'));
    });

    it('resync du slug si le titre change ET que le slug n’avait pas été personnalisé', async () => {
      arrange(existing({ titreFr: 'Ancien Titre', slug: 'ancien-titre' }));

      await controller.update(
        'n1',
        { titreFr: 'Nouveau Titre Éclatant' } as any,
        admin,
      );

      expect(patch().slug).toBe('nouveau-titre-eclatant');
    });

    it('PAS de resync si le slug avait été personnalisé', async () => {
      arrange(existing({ titreFr: 'Ancien Titre', slug: 'slug-fait-main' }));

      await controller.update('n1', { titreFr: 'Nouveau Titre' } as any, admin);

      expect('slug' in patch()).toBe(false);
    });

    it('PAS de resync si dto.slug est fourni (le slug du dto est repris tel quel)', async () => {
      arrange(existing({ titreFr: 'Ancien Titre', slug: 'ancien-titre' }));

      await controller.update(
        'n1',
        { titreFr: 'Nouveau Titre', slug: 'slug-choisi' } as any,
        admin,
      );

      expect(patch().slug).toBe('slug-choisi');
    });

    it('PAS de resync si dto.titreFr est absent', async () => {
      arrange(existing({ titreFr: 'Ancien Titre', slug: 'ancien-titre' }));

      await controller.update('n1', { contenuFr: 'maj' } as any, admin);

      expect('slug' in patch()).toBe(false);
    });

    it('dto.imageUrls fourni → imageUrl = imageUrls[0]', async () => {
      arrange(existing());

      await controller.update(
        'n1',
        { imageUrls: ['https://a.png', 'https://b.png'] } as any,
        admin,
      );

      expect(patch().imageUrl).toBe('https://a.png');
      expect(patch().imageUrls).toEqual(['https://a.png', 'https://b.png']);
    });

    it('dto.imageUrls = [] → imageUrl = null', async () => {
      arrange(existing());

      await controller.update('n1', { imageUrls: [] } as any, admin);

      expect(patch().imageUrl).toBeNull();
      expect(patch().imageUrls).toEqual([]);
    });

    it('dto.imageUrl seul → imageUrls = [imageUrl]', async () => {
      arrange(existing());

      await controller.update(
        'n1',
        { imageUrl: 'https://hero.png' } as any,
        admin,
      );

      expect(patch().imageUrls).toEqual(['https://hero.png']);
      expect(patch().imageUrl).toBe('https://hero.png');
    });

    it('dto.imageUrl chaîne vide → imageUrls = []', async () => {
      arrange(existing());

      await controller.update('n1', { imageUrl: '' } as any, admin);

      expect(patch().imageUrls).toEqual([]);
      expect(patch().imageUrl).toBe('');
    });

    it('aucun champ image dans le dto → ni imageUrl ni imageUrls dans le patch', async () => {
      arrange(existing());

      await controller.update('n1', { contenuFr: 'maj' } as any, admin);

      expect('imageUrl' in patch()).toBe(false);
      expect('imageUrls' in patch()).toBe(false);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('supprime par id et renvoie { id, deleted: true }', async () => {
      const res = await controller.remove('n1', admin);

      expect(newsRepo.delete).toHaveBeenCalledWith({ id: 'n1' });
      expect(res).toEqual({ id: 'n1', deleted: true });
    });

    it('renvoie deleted: true MÊME SI aucune ligne n’a été supprimée', async () => {
      newsRepo.delete.mockResolvedValue({ affected: 0 });

      const res = await controller.remove('inexistant', admin);

      expect(res).toEqual({ id: 'inexistant', deleted: true });
    });
  });
});
