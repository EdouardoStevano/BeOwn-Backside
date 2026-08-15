import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  EmailTemplateService,
  extractCorps,
  extractVariables,
} from './email-template.service';
import { EmailTemplateEntity } from './entities/email-template.entity';

const KNOWN_KEYS = [
  'activation',
  'two-factor',
  'kyc-validated',
  'kyc-rejected',
  'new-project',
  'new-secondary',
  // Garde le seed honnête : seedDefaults skip silencieusement une clé dont
  // l'extraction du corps échoue (structure body/footer inattendue) — sans
  // cette entrée, un ouverture-reservation.hbs mal structuré passerait
  // inaperçu de la suite.
  'ouverture-reservation',
  'echeance',
  'depot-confirmed',
  'retrait-processed',
];

type RepoMock = {
  findOne: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  save: jest.Mock;
};

function makeRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
  };
}

function makeRow(
  overrides: Partial<EmailTemplateEntity> = {},
): EmailTemplateEntity {
  return {
    key: 'activation',
    nom: 'Activation du compte',
    description: null,
    sujet: 'Activez votre compte BeOwn',
    corpsHtml: '<p class="p">Votre code : {{otp}}</p>',
    variables: ['otp'],
    enabled: true,
    updatedAt: new Date(),
    updatedBy: null,
    ...overrides,
  };
}

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;
  let repo: RepoMock;

  beforeEach(async () => {
    repo = makeRepoMock();
    const module = await Test.createTestingModule({
      providers: [
        EmailTemplateService,
        { provide: getRepositoryToken(EmailTemplateEntity), useValue: repo },
      ],
    }).compile();
    service = module.get(EmailTemplateService);
  });

  describe('render — template en base', () => {
    it('compile le sujet et le corps puis injecte le corps dans le layout fixe', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({
          sujet: 'Bonjour {{prenom}}',
          corpsHtml: '<p class="p">Salut {{prenom}}</p>',
        }),
      );

      const result = await service.render('activation', { prenom: 'Awa' });

      expect(result).not.toBeNull();
      expect(result!.sujet).toBe('Bonjour Awa');
      expect(result!.html).toContain('<p class="p">Salut Awa</p>');
      // Layout fixe : header logo + footer légal + document complet
      expect(result!.html).toContain('<!DOCTYPE html>');
      expect(result!.html).toContain('<div class="logo">BeOwn</div>');
      expect(result!.html).toContain(
        '© BeOwn — Investissement immobilier fractionné',
      );
    });

    it('échappe le HTML injecté via les variables du corps (échappement actif)', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ corpsHtml: '<p>{{prenom}}</p>' }),
      );

      const result = await service.render('activation', {
        prenom: '<script>alert(1)</script>',
      });

      expect(result!.html).not.toContain('<script>alert(1)</script>');
      expect(result!.html).toContain('&lt;script&gt;');
    });

    it("n'échappe pas le sujet (texte brut, pas du HTML)", async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ sujet: 'Nouveau projet : {{titre}}' }),
      );

      const result = await service.render('activation', {
        titre: "L'Horizon",
      });

      expect(result!.sujet).toBe("Nouveau projet : L'Horizon");
    });

    it('remplace une variable manquante par une chaîne vide sans throw', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ corpsHtml: '<p>Bonjour {{prenom}} !</p>' }),
      );

      const result = await service.render('activation', {});

      expect(result!.html).toContain('<p>Bonjour  !</p>');
    });

    it('retourne null quand le template est désactivé', async () => {
      repo.findOne.mockResolvedValue(makeRow({ enabled: false }));

      await expect(service.render('activation', {})).resolves.toBeNull();
    });

    it('retombe sur le .hbs du code si le template DB est syntaxiquement invalide', async () => {
      repo.findOne.mockResolvedValue(makeRow({ corpsHtml: '<p>{{#if}}</p>' }));

      const result = await service.render('activation', {
        otp: '424242',
        expiresIn: '5 minutes',
      });

      expect(result).not.toBeNull();
      expect(result!.sujet).toBe('Activez votre compte BeOwn');
      expect(result!.html).toContain('424242');
    });
  });

  describe('render — fallback fichier .hbs du code', () => {
    it("compile le fichier du code quand la clé n'existe pas en base", async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.render('activation', {
        otp: '123456',
        expiresIn: '5 minutes',
      });

      expect(result).not.toBeNull();
      expect(result!.sujet).toBe('Activez votre compte BeOwn');
      expect(result!.html).toContain('123456');
      expect(result!.html).toContain('5 minutes');
      expect(result!.html).toContain('<div class="logo">BeOwn</div>');
    });

    it('compile un sujet dynamique par défaut (clé avec variable dans le sujet)', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.render('new-project', {
        prenom: 'Awa',
        titre: 'Résidence Horizon',
        ville: 'Saint-Denis',
      });

      expect(result!.sujet).toBe(
        'Nouveau projet disponible : Résidence Horizon',
      );
      expect(result!.html).toContain('Résidence Horizon');
    });

    it('retourne null pour une clé inconnue (ni base, ni fichier)', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.render('cle-inexistante', {})).resolves.toBeNull();
    });

    it('retombe sur le .hbs du code quand la lecture DB échoue (panne, table absente)', async () => {
      repo.findOne.mockRejectedValue(new Error('connection refused'));

      const result = await service.render('activation', {
        otp: '654321',
        expiresIn: '5 minutes',
      });

      expect(result).not.toBeNull();
      expect(result!.sujet).toBe('Activez votre compte BeOwn');
      expect(result!.html).toContain('654321');
    });
  });

  describe('renderForPreview — prévisualisation admin', () => {
    it('rend un template DÉSACTIVÉ, là où render() renvoie null', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({
          enabled: false,
          sujet: 'Bonjour {{prenom}}',
          corpsHtml: '<p class="p">Salut {{prenom}}</p>',
        }),
      );

      // Le chemin d'envoi refuse toujours un template désactivé…
      await expect(service.render('activation', { prenom: 'Awa' })).resolves
        .toBeNull();

      // …mais l'admin doit pouvoir le prévisualiser malgré tout.
      const result = await service.renderForPreview('activation', {
        prenom: 'Awa',
      });

      expect(result).not.toBeNull();
      expect(result!.sujet).toBe('Bonjour Awa');
      expect(result!.html).toContain('<p class="p">Salut Awa</p>');
      expect(result!.html).toContain('<div class="logo">BeOwn</div>');
    });

    it("interpole les données d'exemple dans le HTML rendu", async () => {
      repo.findOne.mockResolvedValue(
        makeRow({
          key: 'new-project',
          sujet: 'Nouveau projet : {{titre}}',
          corpsHtml:
            '<p class="h1">{{titre}}</p><p class="location">{{ville}}</p><p class="p">Bonjour {{prenom}}</p>',
        }),
      );

      const result = await service.renderForPreview('new-project', {
        prenom: 'Awa',
        titre: 'Résidence Horizon',
        ville: 'Saint-Denis',
      });

      expect(result!.sujet).toBe('Nouveau projet : Résidence Horizon');
      expect(result!.html).toContain('Résidence Horizon');
      expect(result!.html).toContain('Saint-Denis');
      expect(result!.html).toContain('Bonjour Awa');
      // Aucune variable non substituée ne doit fuiter dans la préviz.
      expect(result!.html).not.toContain('{{');
    });
  });

  describe('seedDefaults', () => {
    it('insère toutes les clés .hbs manquantes, corps sans header/footer', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.insert.mockResolvedValue({});

      await service.seedDefaults();

      const insertedRows = repo.insert.mock.calls.map(
        ([row]) => row as EmailTemplateEntity,
      );
      const insertedKeys = insertedRows.map((row) => row.key);
      for (const key of KNOWN_KEYS) {
        expect(insertedKeys).toContain(key);
      }
      for (const row of insertedRows) {
        expect(row.enabled).toBe(true);
        expect(row.updatedBy).toBeNull();
        expect(row.corpsHtml).not.toContain('<!DOCTYPE');
        expect(row.corpsHtml).not.toContain('class="header"');
        expect(row.corpsHtml).not.toContain('class="footer"');
        expect(row.sujet.length).toBeGreaterThan(0);
        expect(Array.isArray(row.variables)).toBe(true);
      }
      const activation = insertedRows.find((row) => row.key === 'activation')!;
      expect(activation.sujet).toBe('Activez votre compte BeOwn');
      expect(activation.variables).toEqual(
        expect.arrayContaining(['otp', 'expiresIn']),
      );
    });

    it("est idempotent : un second appel n'insère rien et n'écrase pas une ligne modifiée", async () => {
      const store = new Map<string, EmailTemplateEntity>();
      repo.findOne.mockImplementation(({ where }: { where: { key: string } }) =>
        Promise.resolve(store.get(where.key) ?? null),
      );
      repo.insert.mockImplementation((row: EmailTemplateEntity) => {
        store.set(row.key, row);
        return Promise.resolve({});
      });

      await service.seedDefaults();
      const insertedCount = repo.insert.mock.calls.length;
      expect(insertedCount).toBeGreaterThanOrEqual(KNOWN_KEYS.length);

      // Modification admin simulée entre les deux seeds
      store.get('activation')!.sujet = 'Sujet personnalisé par un admin';
      store.get('activation')!.enabled = false;

      await service.seedDefaults();

      expect(repo.insert).toHaveBeenCalledTimes(insertedCount);
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(store.get('activation')!.sujet).toBe(
        'Sujet personnalisé par un admin',
      );
      expect(store.get('activation')!.enabled).toBe(false);
    });

    it('continue le seed des autres clés quand une insertion échoue', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.insert.mockImplementation((row: EmailTemplateEntity) =>
        row.key === 'activation'
          ? Promise.reject(new Error('duplicate key value'))
          : Promise.resolve({}),
      );

      await service.seedDefaults();

      const insertedKeys = repo.insert.mock.calls.map(
        ([row]) => (row as EmailTemplateEntity).key,
      );
      // Toutes les clés ont été tentées malgré l'échec sur activation
      for (const key of KNOWN_KEYS) {
        expect(insertedKeys).toContain(key);
      }
    });

    it('est appelé au bootstrap via onModuleInit', async () => {
      const spy = jest
        .spyOn(service, 'seedDefaults')
        .mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('extraction des corps et variables', () => {
    const SAMPLE = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Exemple</title>
<style>body{margin:0}.wrap{max-width:560px}.header{background:#1A2E35}.body{padding:40px}.h1{font-size:22px;font-weight:700;color:#1A2E35;margin:0 0 12px;text-align:center}.card{background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px}.footer{background:#f8fafc}</style></head>
<body><div class="wrap">
  <div class="header"><div class="logo">BeOwn</div></div>
  <div class="body">
    <p class="h1">Bonjour {{prenom}}</p>
    <div class="card"><span>{{montant}}</span></div>
    {{#if motif}}<p>{{motif}}</p>{{/if}}
  </div>
  <div class="footer">© BeOwn — Investissement immobilier fractionné</div>
</div></body></html>`;

    it('extrait le contenu de <div class="body"> sans header ni footer', () => {
      const corps = extractCorps(SAMPLE)!;

      expect(corps).toContain('Bonjour {{prenom}}');
      expect(corps).toContain('{{#if motif}}');
      expect(corps).not.toContain('class="header"');
      expect(corps).not.toContain('class="footer"');
      expect(corps).not.toContain('<!DOCTYPE');
    });

    it('inline la déclaration du template quand elle diffère du défaut du layout', () => {
      const corps = extractCorps(SAMPLE)!;

      // .h1 du sample est centré (diffère du layout) → inliné
      expect(corps).toContain(
        'class="h1" style="font-size:22px;font-weight:700;color:#1A2E35;margin:0 0 12px;text-align:center"',
      );
      // .card du sample est identique au layout → pas de style inline
      expect(corps).toContain('<div class="card">');
      expect(corps).not.toContain('class="card" style=');
    });

    it('retourne null quand la structure body/footer est introuvable', () => {
      expect(
        extractCorps('<html><body><p>autre structure</p></body></html>'),
      ).toBeNull();
    });

    it('extrait les variables {{var}} et {{#if var}} dédupliquées et triées', () => {
      const vars = extractVariables(
        'Sujet {{titre}} — corps {{prenom}} {{#if motif}}{{motif}}{{/if}} {{titre}}',
      );

      expect(vars).toEqual(['motif', 'prenom', 'titre']);
    });
  });
});
