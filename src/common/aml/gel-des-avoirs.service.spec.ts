import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GelDesAvoirsService } from './gel-des-avoirs.service';
import { CODE_AVOIRS_GELES } from './domains/gel-des-avoirs';

describe('GelDesAvoirsService', () => {
  let service: GelDesAvoirsService;
  let userRepo: any;
  let auditLog: any;

  const construire = (user: unknown) => {
    userRepo = {
      findOne: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    service = new GelDesAvoirsService(userRepo, auditLog);
  };

  describe('assertAvoirsNonGeles (garde des 4 chemins)', () => {
    it('laisse passer un compte non gelé', async () => {
      construire({ userId: 10, avoirsGelesLe: null });
      await expect(service.assertAvoirsNonGeles(10)).resolves.toBeUndefined();
    });

    it('laisse passer un utilisateur inconnu (les gardes aval décident)', async () => {
      construire(null);
      await expect(service.assertAvoirsNonGeles(999)).resolves.toBeUndefined();
    });

    it('refuse un compte gelé en 403 avec le code stable AVOIRS_GELES', async () => {
      construire({ userId: 10, avoirsGelesLe: new Date('2026-09-03T08:00:00Z') });
      const promesse = service.assertAvoirsNonGeles(10);
      await expect(promesse).rejects.toBeInstanceOf(ForbiddenException);
      const err = await promesse.catch((e) => e);
      expect(err.getStatus()).toBe(403);
      expect(err.getResponse()).toMatchObject({ code: CODE_AVOIRS_GELES });
    });

    it('porte le message NEUTRE unique de la mission conformité (§ 4.1) — sans autorité citée', async () => {
      construire({ userId: 10, avoirsGelesLe: new Date() });
      const err = await service.assertAvoirsNonGeles(10).catch((e) => e);
      const message = (err.getResponse() as { message: string }).message;
      expect(message).toContain(
        "Cette opération n'est pas disponible sur votre compte actuellement.",
      );
      expect(message).toContain(
        "Certaines opérations font l'objet d'une restriction temporaire en application de nos obligations légales.",
      );
      expect(message).toContain(
        'Votre solde et vos investissements restent enregistrés sur votre compte.',
      );
      // Neutralité : aucune autorité, aucun mécanisme nommé.
      for (const interdit of ['Tracfin', 'AMF', 'gel', 'sanction', 'blanchiment']) {
        expect(message.toLowerCase()).not.toContain(interdit.toLowerCase());
      }
    });

    it("journalise la tentative refusée (best-effort : l'échec d'audit ne change pas le refus)", async () => {
      construire({ userId: 10, avoirsGelesLe: new Date() });
      auditLog.create.mockRejectedValue(new Error('audit KO'));
      await expect(service.assertAvoirsNonGeles(10)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(auditLog.create).toHaveBeenCalledWith(
        '10',
        expect.anything(),
        'aml.gel.operation-refusee',
        'user',
        '10',
      );
    });
  });

  describe('geler / degeler (acte humain)', () => {
    const admin = { userId: 15, role: 'compliance' };

    it('gèle avec horodatage + motif, et audite', async () => {
      construire({ userId: 10, avoirsGelesLe: null, avoirsGelesMotif: null });
      const resultat = await service.geler(10, 'Inscription registre national', admin);
      expect(resultat.avoirsGelesMotif).toBe('Inscription registre national');
      expect(resultat.avoirsGelesLe).toBeInstanceOf(Date);
      expect(userRepo.update).toHaveBeenCalledWith(
        { userId: 10 },
        expect.objectContaining({
          avoirsGelesMotif: 'Inscription registre national',
          avoirsGelesLe: expect.any(Date),
        }),
      );
      expect(auditLog.create).toHaveBeenCalledWith(
        '15',
        'compliance',
        'aml.gel.geler',
        'user',
        '10',
        undefined,
        undefined,
        { motif: 'Inscription registre national' },
      );
    });

    it('re-geler un compte déjà gelé conserve la date d’origine (idempotent)', async () => {
      const origine = new Date('2026-08-01T00:00:00Z');
      construire({ userId: 10, avoirsGelesLe: origine, avoirsGelesMotif: 'ancien' });
      const resultat = await service.geler(10, 'motif mis à jour', admin);
      expect(resultat.avoirsGelesLe).toBe(origine);
    });

    it('dégèle (remise à null) et audite avec le motif précédent', async () => {
      construire({
        userId: 10,
        avoirsGelesLe: new Date(),
        avoirsGelesMotif: 'Inscription registre national',
      });
      const resultat = await service.degeler(10, admin);
      expect(resultat.avoirsGelesLe).toBeNull();
      expect(userRepo.update).toHaveBeenCalledWith(
        { userId: 10 },
        { avoirsGelesLe: null, avoirsGelesMotif: null },
      );
      expect(auditLog.create).toHaveBeenCalledWith(
        '15',
        'compliance',
        'aml.gel.degeler',
        'user',
        '10',
        undefined,
        undefined,
        { motifPrecedent: 'Inscription registre national' },
      );
    });

    it('geler/dégeler un utilisateur introuvable → 404', async () => {
      construire(null);
      await expect(service.geler(999, 'motif', admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.degeler(999, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
