import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { EMAIL_TEMPLATE_SAMPLES } from './email-template.samples';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

const admin = { userId: 1, email: 'admin@beown.fr' } as any;

const makeRow = (overrides: any = {}) => ({
  key: 'new-project',
  nom: 'Nouveau projet',
  description: "Annonce d'un nouveau projet.",
  sujet: 'Nouveau projet : {{titre}}',
  corpsHtml: '<p class="p">Bonjour {{prenom}}</p>',
  variables: ['prenom', 'titre'],
  enabled: true,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  updatedBy: null,
  ...overrides,
});

/** updatedAt écrit par la base (@UpdateDateColumn) lors d'un UPDATE. */
const SAVED_AT = new Date('2026-02-02T10:00:00Z');

const makeController = (opts: { row?: any; role?: UserRole } = {}) => {
  const row = opts.row === undefined ? makeRow() : opts.row;
  const userRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue({ userId: 1, role: opts.role ?? UserRole.SUPER_ADMIN }),
  };
  const templateRepo = {
    find: jest.fn().mockResolvedValue(row ? [row] : []),
    // findOne renvoie la MÊME référence que `update` mute : la re-lecture
    // post-écriture du controller voit donc bien l'état persisté.
    findOne: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockImplementation(async (_where: any, patch: any) => {
      if (row) Object.assign(row, patch, { updatedAt: SAVED_AT });
    }),
  };
  const templates = {
    render: jest.fn().mockResolvedValue({ sujet: 'S', html: '<html>H</html>' }),
    renderForPreview: jest
      .fn()
      .mockResolvedValue({ sujet: 'S', html: '<html>H</html>' }),
  };
  const emailService = {
    sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new AdminEmailTemplatesController(
    userRepo as any,
    templateRepo as any,
    templates as any,
    emailService as any,
  );
  return { controller, userRepo, templateRepo, templates, emailService };
};

describe('AdminEmailTemplatesController', () => {
  describe('permissions', () => {
    it("refuse l'accès si l'utilisateur n'a pas settings:manage (403)", async () => {
      const { controller, templateRepo } = makeController({
        role: UserRole.MARKETING,
      });

      await expect(controller.list(admin)).rejects.toThrow(
        /Forbidden|forbidden/i,
      );
      expect(templateRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('renvoie le résumé avec événement déclencheur, sans le corps HTML', async () => {
      const { controller } = makeController();

      const result = await controller.list(admin);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        key: 'new-project',
        nom: 'Nouveau projet',
        evenementDeclencheur: "Publication d'un nouveau projet d'investissement",
        sujet: 'Nouveau projet : {{titre}}',
        enabled: true,
      });
      expect(result[0]).not.toHaveProperty('corpsHtml');
    });
  });

  describe('getOne', () => {
    it('renvoie le détail avec le corps HTML', async () => {
      const { controller } = makeController();

      const result = await controller.getOne('new-project', admin);

      expect(result.corpsHtml).toBe('<p class="p">Bonjour {{prenom}}</p>');
      expect(result.evenementDeclencheur).toContain('Publication');
    });

    it('404 pour une clé inconnue', async () => {
      const { controller } = makeController({ row: null });

      await expect(controller.getOne('inconnue', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('persiste sujet/corps/enabled et renseigne updatedBy = admin courant', async () => {
      const { controller, templateRepo } = makeController();

      const result = await controller.update(
        'new-project',
        { sujet: 'Nouveau sujet', enabled: false },
        admin,
      );

      expect(templateRepo.update).toHaveBeenCalledWith(
        { key: 'new-project' },
        { updatedBy: 'admin@beown.fr', sujet: 'Nouveau sujet', enabled: false },
      );
      expect(result.sujet).toBe('Nouveau sujet');
      expect(result.enabled).toBe(false);
      expect(result.updatedBy).toBe('admin@beown.fr');
    });

    it("renvoie l'updatedAt réellement persisté, pas celui d'avant l'écriture", async () => {
      const { controller } = makeController();

      const result = await controller.update(
        'new-project',
        { sujet: 'Nouveau sujet' },
        admin,
      );

      // Re-lecture post-UPDATE : surtout pas l'updatedAt de la ligne lue avant.
      expect(result.updatedAt).toEqual(SAVED_AT);
      expect(result.updatedAt).not.toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it("ne persiste que les champs fournis (corpsHtml absent → non touché)", async () => {
      const { controller, templateRepo } = makeController();

      await controller.update('new-project', { enabled: true }, admin);

      const patch = templateRepo.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty('corpsHtml');
      expect(patch).not.toHaveProperty('sujet');
      expect(patch.updatedBy).toBe('admin@beown.fr');
    });

    it('404 pour une clé inconnue', async () => {
      const { controller, templateRepo } = makeController({ row: null });

      await expect(
        controller.update('inconnue', { enabled: true }, admin),
      ).rejects.toThrow(NotFoundException);
      expect(templateRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it("rend le template avec les données d'exemple de la clé", async () => {
      const { controller, templates } = makeController();

      const result = await controller.preview('new-project', admin);

      expect(templates.renderForPreview).toHaveBeenCalledWith(
        'new-project',
        EMAIL_TEMPLATE_SAMPLES['new-project'],
      );
      expect(result).toEqual({ sujet: 'S', html: '<html>H</html>' });
    });

    it('rend même un template désactivé (via renderForPreview)', async () => {
      const { controller, templates } = makeController({
        row: makeRow({ enabled: false }),
      });

      const result = await controller.preview('new-project', admin);

      expect(templates.renderForPreview).toHaveBeenCalled();
      expect(result.html).toBe('<html>H</html>');
    });

    it('404 pour une clé inconnue', async () => {
      const { controller } = makeController({ row: null });

      await expect(controller.preview('inconnue', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('test', () => {
    it("envoie l'email de test à l'adresse de l'admin courant", async () => {
      const { controller, templates, emailService } = makeController();

      const result = await controller.test('new-project', admin);

      expect(templates.render).toHaveBeenCalledWith(
        'new-project',
        EMAIL_TEMPLATE_SAMPLES['new-project'],
      );
      expect(emailService.sendTransactionalEmail).toHaveBeenCalledWith(
        'admin@beown.fr',
        'S',
        '<html>H</html>',
      );
      expect(result).toEqual({ ok: true, sentTo: 'admin@beown.fr' });
    });

    it('refuse (409) si le template est désactivé et n\'envoie rien', async () => {
      const { controller, emailService } = makeController({
        row: makeRow({ enabled: false }),
      });

      await expect(controller.test('new-project', admin)).rejects.toThrow(
        ConflictException,
      );
      expect(emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it('404 pour une clé inconnue', async () => {
      const { controller, emailService } = makeController({ row: null });

      await expect(controller.test('inconnue', admin)).rejects.toThrow(
        NotFoundException,
      );
      expect(emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    });
  });
});
