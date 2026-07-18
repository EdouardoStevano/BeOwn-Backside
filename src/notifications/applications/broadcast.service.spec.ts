import { BroadcastService } from './broadcast.service';
import { UserStatus } from 'src/users/infrastructure/persistences/entities/user.entity';

/**
 * Specs de BroadcastService — AUCUN transport réel : EMAIL_SERVICE et
 * SMS_SERVICE sont systématiquement mockés (le .env local porte de vraies
 * clés Twilio ; un appel réel enverrait un SMS facturé).
 */

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    slug: 'residence-horizon',
    titre: 'Résidence Horizon',
    ville: 'Saint-Denis',
    pays: 'FR',
    statut: 'en_collecte',
    triCible: 8,
    dateOuvertureCollecte: new Date('2026-08-15T00:00:00Z'),
    dateCloturePrevue: new Date('2026-09-30T00:00:00Z'),
    broadcastAnnonceAt: null,
    broadcastCollecteAt: null,
    ...overrides,
  };
}

function makeUser(userId: number, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    firstname: `User${userId}`,
    status: UserStatus.ACTIF,
    role: 'investisseur',
    userEmail: { email: `user${userId}@test.fr` },
    ...overrides,
  };
}

/** Préférences opt-in complètes (ligne user_preferences existante). */
function makePrefs(userId: number, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    notifEmail: true,
    notifSms: true,
    notifMarketing: true,
    ...overrides,
  };
}

interface Deps {
  projectRepo: any;
  userRepo: any;
  prefsRepo: any;
  profilRepo: any;
  settingsRepo: any;
  templates: any;
  emailService: any;
  smsService: any;
  tokenService: any;
  notifications: any;
  auditLog: any;
  config: any;
}

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  const deps: Deps = {
    projectRepo: {
      findOne: jest.fn().mockResolvedValue(makeProject()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    },
    userRepo: {
      find: jest.fn().mockResolvedValue([makeUser(1)]),
      findOne: jest
        .fn()
        .mockResolvedValue({ userId: 99, role: 'super_admin' }),
    },
    prefsRepo: { find: jest.fn().mockResolvedValue([makePrefs(1)]) },
    profilRepo: { find: jest.fn().mockResolvedValue([]) },
    settingsRepo: { findOne: jest.fn().mockResolvedValue(null) },
    templates: {
      render: jest.fn().mockResolvedValue({
        sujet: 'Sujet test',
        html: '<html>corps</html>',
      }),
    },
    emailService: { sendTransactionalEmail: jest.fn().mockResolvedValue(undefined) },
    smsService: {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendTransactional: jest.fn().mockResolvedValue(undefined),
    },
    tokenService: {
      generateUnsubscribeToken: jest.fn().mockResolvedValue('tok-123'),
    },
    notifications: { push: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    config: { get: jest.fn().mockReturnValue('https://app.beown.fr') },
    ...overrides,
  };
  return deps;
}

function makeService(deps: Deps): BroadcastService {
  return new BroadcastService(
    deps.projectRepo,
    deps.userRepo,
    deps.prefsRepo,
    deps.profilRepo,
    deps.settingsRepo,
    deps.templates,
    deps.emailService,
    deps.smsService,
    deps.tokenService,
    deps.notifications,
    deps.auditLog,
    deps.config,
  );
}

/** Toggles admin avec SMS activé (les défauts sont email on / sms off). */
function settingsWithSms() {
  return {
    id: 'default',
    settings: {
      notifications: {
        broadcast: {
          nouveauProjet: { email: true, sms: true },
          ouvertureReservation: { email: true, sms: true },
        },
      },
    },
  };
}

describe('BroadcastService — anti-doublon', () => {
  it('pose broadcastCollecteAt AVANT les envois (lancement projet)', async () => {
    const deps = makeDeps();
    const order: string[] = [];
    deps.projectRepo.update.mockImplementation(() => {
      order.push('claim');
      return Promise.resolve({ affected: 1 });
    });
    deps.emailService.sendTransactionalEmail.mockImplementation(() => {
      order.push('email');
      return Promise.resolve();
    });

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(result.diffuse).toBe(true);
    expect(order[0]).toBe('claim');
    expect(deps.projectRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROJECT_ID }),
      expect.objectContaining({ broadcastCollecteAt: expect.any(Date) }),
    );
  });

  it('2e appel = no-op : horodatage déjà posé, 0 envoi', async () => {
    const deps = makeDeps();
    deps.projectRepo.findOne.mockResolvedValue(
      makeProject({ broadcastCollecteAt: new Date() }),
    );

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(result.diffuse).toBe(false);
    expect(deps.projectRepo.update).not.toHaveBeenCalled();
    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deps.smsService.sendTransactional).not.toHaveBeenCalled();
    expect(deps.notifications.push).not.toHaveBeenCalled();
    expect(deps.auditLog.create).not.toHaveBeenCalled();
  });

  it('appel concurrent perdant (UPDATE affected=0) = no-op, 0 envoi', async () => {
    const deps = makeDeps();
    deps.projectRepo.update.mockResolvedValue({ affected: 0 });

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(result.diffuse).toBe(false);
    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deps.notifications.push).not.toHaveBeenCalled();
  });

  it("la campagne réservation utilise broadcastAnnonceAt (indépendante de l'autre)", async () => {
    const deps = makeDeps();
    deps.projectRepo.findOne.mockResolvedValue(
      makeProject({ broadcastCollecteAt: new Date(), statut: 'annonce' }),
    );

    const result = await makeService(deps).announceReservationOpened(
      PROJECT_ID,
      99,
    );

    expect(result.diffuse).toBe(true);
    expect(deps.projectRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROJECT_ID }),
      expect.objectContaining({ broadcastAnnonceAt: expect.any(Date) }),
    );
    expect(deps.templates.render).toHaveBeenCalledWith(
      'ouverture-reservation',
      expect.any(Object),
    );
  });

  it('projet introuvable = no-op silencieux (jamais de throw)', async () => {
    const deps = makeDeps();
    deps.projectRepo.findOne.mockResolvedValue(null);

    const result = await makeService(deps).announceProjectLaunched('nope', 99);

    expect(result.diffuse).toBe(false);
    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe('BroadcastService — filtrage des destinataires', () => {
  it('ne cible que les utilisateurs ACTIFS (filtre en base)', async () => {
    const deps = makeDeps();

    await makeService(deps).announceProjectLaunched(PROJECT_ID, 99);

    expect(deps.userRepo.find).toHaveBeenCalledWith({
      where: { status: UserStatus.ACTIF },
    });
  });

  it('notifEmail=false → pas d\'email (mais notif in-app quand même)', async () => {
    const deps = makeDeps();
    deps.prefsRepo.find.mockResolvedValue([
      makePrefs(1, { notifEmail: false }),
    ]);

    await makeService(deps).announceProjectLaunched(PROJECT_ID, 99);

    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deps.notifications.push).toHaveBeenCalledTimes(1);
  });

  it('notifMarketing=false → ni email ni SMS', async () => {
    const deps = makeDeps();
    deps.settingsRepo.findOne.mockResolvedValue(settingsWithSms());
    deps.prefsRepo.find.mockResolvedValue([
      makePrefs(1, { notifMarketing: false }),
    ]);
    deps.profilRepo.find.mockResolvedValue([
      { utilisateurId: 1, telephone: '+33612345678' },
    ]);

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deps.smsService.sendTransactional).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("sans ligne user_preferences : opt-out (D2) → l'annonce part, avec lien de désinscription", async () => {
    const deps = makeDeps();
    deps.prefsRepo.find.mockResolvedValue([]);

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    // Pas de ligne = jamais exprimé de choix → diffusion par défaut, le lien
    // de désinscription de l'email servant de garde-fou.
    expect(deps.emailService.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(deps.templates.render).toHaveBeenCalledWith(
      'new-project',
      expect.objectContaining({
        unsubscribeUrl: 'https://app.beown.fr/desinscription?token=tok-123',
      }),
    );
    // SMS : toggles admin par défaut (off) — les préférences n'y changent rien.
    expect(deps.smsService.sendTransactional).not.toHaveBeenCalled();
    expect(result.emails).toBe(1);
    expect(result.skipped).toBe(0);
    expect(deps.notifications.push).toHaveBeenCalledTimes(1);
  });

  it('une ligne existante reste respectée verbatim (opt-out enregistré → 0 envoi)', async () => {
    const deps = makeDeps();
    // Ligne matérialisée par un unsubscribe : notifMarketing=false.
    deps.prefsRepo.find.mockResolvedValue([
      makePrefs(1, { notifMarketing: false }),
    ]);

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deps.smsService.sendTransactional).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('téléphone absent ou non-E.164 → SMS skippé, email envoyé', async () => {
    const deps = makeDeps();
    deps.settingsRepo.findOne.mockResolvedValue(settingsWithSms());
    deps.userRepo.find.mockResolvedValue([
      makeUser(1),
      makeUser(2),
      makeUser(3),
    ]);
    deps.prefsRepo.find.mockResolvedValue([
      makePrefs(1),
      makePrefs(2),
      makePrefs(3),
    ]);
    deps.profilRepo.find.mockResolvedValue([
      // user 1 : pas de profil → pas de téléphone
      { utilisateurId: 2, telephone: '0612345678' }, // format national, pas E.164
      { utilisateurId: 3, telephone: '+33612345678' },
    ]);

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(deps.smsService.sendTransactional).toHaveBeenCalledTimes(1);
    expect(deps.smsService.sendTransactional).toHaveBeenCalledWith(
      '+33612345678',
      expect.stringContaining('Résidence Horizon'),
    );
    expect(result.emails).toBe(3);
    expect(result.sms).toBe(1);
  });

  it("l'email porte le lien de désinscription individuel", async () => {
    const deps = makeDeps();

    await makeService(deps).announceProjectLaunched(PROJECT_ID, 99);

    expect(deps.tokenService.generateUnsubscribeToken).toHaveBeenCalledWith(1);
    expect(deps.templates.render).toHaveBeenCalledWith(
      'new-project',
      expect.objectContaining({
        unsubscribeUrl: 'https://app.beown.fr/desinscription?token=tok-123',
        prenom: 'User1',
        titre: 'Résidence Horizon',
      }),
    );
  });
});

describe('BroadcastService — toggles admin', () => {
  it('email=false et sms=false → 0 envoi (in-app seulement)', async () => {
    const deps = makeDeps();
    deps.settingsRepo.findOne.mockResolvedValue({
      id: 'default',
      settings: {
        notifications: {
          broadcast: { nouveauProjet: { email: false, sms: false } },
        },
      },
    });

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deps.smsService.sendTransactional).not.toHaveBeenCalled();
    expect(result.emails).toBe(0);
    expect(result.sms).toBe(0);
    expect(deps.notifications.push).toHaveBeenCalledTimes(1);
  });

  it('SMS OFF PAR DÉFAUT : sans réglage admin, aucun SMS ne part même en full opt-in', async () => {
    const deps = makeDeps();
    deps.settingsRepo.findOne.mockResolvedValue(null); // aucun réglage stocké
    deps.profilRepo.find.mockResolvedValue([
      { utilisateurId: 1, telephone: '+33612345678' },
    ]);
    // prefs par défaut du makeDeps : notifSms=true, notifMarketing=true

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(deps.smsService.sendTransactional).not.toHaveBeenCalled();
    // Les téléphones ne sont même pas chargés quand le canal SMS est off.
    expect(deps.profilRepo.find).not.toHaveBeenCalled();
    expect(result.sms).toBe(0);
    expect(result.emails).toBe(1);
  });

  it('lecture des settings en échec → défauts appliqués (email on, sms off)', async () => {
    const deps = makeDeps();
    deps.settingsRepo.findOne.mockRejectedValue(new Error('db down'));

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(result.diffuse).toBe(true);
    expect(result.emails).toBe(1);
    expect(result.sms).toBe(0);
  });
});

describe('BroadcastService — résilience des envois', () => {
  it("l'échec d'un email n'interrompt pas le lot (allSettled)", async () => {
    const deps = makeDeps();
    deps.userRepo.find.mockResolvedValue([
      makeUser(1),
      makeUser(2),
      makeUser(3),
    ]);
    deps.prefsRepo.find.mockResolvedValue([
      makePrefs(1),
      makePrefs(2),
      makePrefs(3),
    ]);
    deps.emailService.sendTransactionalEmail
      .mockRejectedValueOnce(new Error('brevo 500'))
      .mockResolvedValue(undefined);

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(deps.emailService.sendTransactionalEmail).toHaveBeenCalledTimes(3);
    expect(result.emails).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.diffuse).toBe(true);
  });

  it('template désactivé (render → null) : pas d\'email, SMS et in-app continuent', async () => {
    const deps = makeDeps();
    deps.templates.render.mockResolvedValue(null);
    deps.settingsRepo.findOne.mockResolvedValue(settingsWithSms());
    deps.profilRepo.find.mockResolvedValue([
      { utilisateurId: 1, telephone: '+33612345678' },
    ]);

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(deps.emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(deps.smsService.sendTransactional).toHaveBeenCalledTimes(1);
    expect(deps.notifications.push).toHaveBeenCalledTimes(1);
    expect(result.templateDisabled).toBe(true);
    expect(result.emails).toBe(0);
    expect(result.sms).toBe(1);
  });

  it('ne throw jamais vers l\'appelant, même sur une panne totale en amont', async () => {
    const deps = makeDeps();
    deps.projectRepo.findOne.mockRejectedValue(new Error('db down'));

    await expect(
      makeService(deps).announceProjectLaunched(PROJECT_ID, 99),
    ).resolves.toMatchObject({ diffuse: false });
  });

  it('lots de 20 : 45 destinataires → 3 vagues, tous servis', async () => {
    const deps = makeDeps();
    const users = Array.from({ length: 45 }, (_, i) => makeUser(i + 1));
    deps.userRepo.find.mockResolvedValue(users);
    deps.prefsRepo.find.mockResolvedValue(
      users.map((u: any) => makePrefs(u.userId)),
    );

    const result = await makeService(deps).announceProjectLaunched(
      PROJECT_ID,
      99,
    );

    expect(result.emails).toBe(45);
    expect(deps.notifications.push).toHaveBeenCalledTimes(45);
  });
});

describe('BroadcastService — audit', () => {
  it('journalise volumes et déclencheur après diffusion', async () => {
    const deps = makeDeps();

    await makeService(deps).announceProjectLaunched(PROJECT_ID, 99);

    expect(deps.auditLog.create).toHaveBeenCalledWith(
      '99',
      'super_admin',
      'notification.broadcast.nouveau_projet',
      'projet',
      PROJECT_ID,
      undefined,
      undefined,
      expect.objectContaining({
        destinataires: 1,
        emails: 1,
        sms: 0,
        triggeredBy: 99,
      }),
    );
  });
});
