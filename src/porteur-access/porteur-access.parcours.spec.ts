/* eslint-disable @typescript-eslint/unbound-method --
 * Ces tests LISENT des handlers de contrôleur par réflexion pour éprouver
 * leurs métadonnées de garde et de permission ; ils ne les appellent jamais.
 * La règle vise l'appel détaché de son objet, pas la lecture. Même patron que
 * `kyc-validated.endpoints.spec.ts` et `route-permissions.hardening.spec.ts`.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { statutHttpDeLErreur } from 'src/common/audit/statut-erreur-metier';
import { PermissionsGuard } from 'src/common/auth/permissions.guard';
import { PorteurAccessGuard } from 'src/common/auth/porteur-access.guard';
import { RolesGuard } from 'src/common/auth/roles.guard';
import { PERMISSIONS_KEY } from 'src/common/auth/require-permission.decorator';
import { ROLES_KEY } from 'src/common/auth/roles.decorator';
import { IS_PUBLIC_KEY } from 'src/common/auth/public.decorator';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import type {
  AccesPorteurEnBase,
  UserRepository,
} from 'src/iam/domains/ports/user.repository';
import type {
  PushAdminNotificationOptions,
  PushNotificationOptions,
} from 'src/notifications/applications/notification.service';
import type { NotificationEntity } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import type { AuditLogEntity } from 'src/notifications/infrastructure/persistences/entities/audit-log.entity';
import type {
  JournalAudit,
  Notificateur,
} from './applications/ports/services-transverses.port';
import { PorteurController } from 'src/locative-management/presenters/http/porteur.controller';
import { PorteurTresorerieController } from 'src/payments/presenters/http/porteur-tresorerie.controller';
import { ProjectController } from 'src/projects/presenters/http/project.controller';
import { InMemoryDemandeAccesPorteurRepository } from './infrastructure/persistences/repositories/in-memory-demande-acces-porteur.repository';
import { SoumettreDemandePorteurUseCase } from './applications/usecases/soumettre-demande-porteur.usecase';
import { InstruireDemandePorteurUseCase } from './applications/usecases/instruire-demande-porteur.usecase';
import { DeciderDemandePorteurUseCase } from './applications/usecases/decider-demande-porteur.usecase';
import { RetirerDemandePorteurUseCase } from './applications/usecases/retirer-demande-porteur.usecase';
import { StatuerAccesPorteurUseCase } from './applications/usecases/statuer-acces-porteur.usecase';
import { AdminPorteurAccessController } from './presenters/http/admin-porteur-access.controller';
import { PorteurAccessController } from './presenters/http/porteur-access.controller';
import {
  DELAI_CARENCE_APRES_REFUS_JOURS,
  DemandeAccesPorteur,
  StatutDemandeAccesPorteur,
} from './domains/demande-acces-porteur';
import { MotifRefusAccesPorteur } from './domains/motif-refus';
import {
  LIBELLES_MOTIF_RETRAIT,
  MotifRetraitAccesPorteur,
} from './domains/motif-retrait';
import {
  versLigneFile,
  versVueDemandeur,
} from './presenters/http/demande-acces-porteur.presenter';
import {
  AccesPorteurDejaOuvertError,
  AccesPorteurEtatInchangeError,
  CompteInactifError,
  CompteIntrouvableError,
  DemandeAccesPorteurEnCoursError,
  DemandeAccesPorteurEtrangereError,
  DemandeAccesPorteurIntrouvableError,
  DemandeTropRapprocheeError,
  MotifRefusRequisError,
  MotifRetraitRequisError,
  RoleNonEligibleError,
  TransitionDemandeInterditeError,
} from './domains/errors/porteur-access.errors';

/**
 * Parcours complet de l'accès porteur — soumission → examen → acceptation →
 * ACCÈS EFFECTIF à une route porteur par un compte resté investisseur.
 *
 * Ces tests éprouvent la chaîne RÉELLE : vrais use cases, vrai
 * `PorteurAccessGuard`, vrai `PermissionsGuard`, vrai `RolesGuard`, vraies
 * métadonnées des contrôleurs de production. Seules les frontières sortantes
 * sont en mémoire (dépôt des demandes, dépôt utilisateur, cache de sessions,
 * notifications, audit) — aucune base, aucun réseau, comme l'exige la règle
 * « le domaine et l'application se testent sans infrastructure ».
 *
 * Modèle : `refresh-token.usecase.security.spec.ts`.
 */

const INVESTISSEUR_ID = 42;
const PORTEUR_PUR_ID = 43;
const ADMIN_ID = 7;
const EMAIL = 'investisseur@example.com';
const MOTIVATION =
  'Je porte un immeuble de trois logements et souhaite le financer sur BeOwn.';
/** Horodatage fixe des retraits — comparable sans dépendre de l'horloge. */
const T_RETRAIT = new Date('2026-09-04T12:00:00.000Z');

/** Compte en mémoire : `role` et `porteurAccess` sont mutables, comme en base. */
interface Compte {
  userId: number;
  email: string;
  role: UserRole;
  porteurAccess: boolean;
  /** Horodatage du dernier retrait d'accès — `null` tant qu'il court. */
  accesRevoqueLe: Date | null;
  status: UserStatus;
}

/**
 * Dépôt utilisateur en mémoire honorant le contrat du port pour ce qui est
 * consommé ici (§LSP : l'implémentation de substitution respecte le contrat).
 * Les méthodes hors périmètre lèvent au lieu de rendre `null` en silence — un
 * appel inattendu doit se voir.
 */
class InMemoryUserRepository implements Partial<UserRepository> {
  constructor(private readonly comptes: Compte[]) {}

  findById(userId: number) {
    const compte = this.comptes.find((c) => c.userId === userId);
    return Promise.resolve(
      compte
        ? buildUser({
            userId: compte.userId,
            email: compte.email,
            emailVerified: true,
            role: compte.role,
            status: compte.status,
          })
        : null,
    );
  }

  findAccesPorteur(userId: number): Promise<AccesPorteurEnBase | null> {
    const compte = this.comptes.find((c) => c.userId === userId);
    return Promise.resolve(
      compte
        ? {
            role: compte.role,
            porteurAccess: compte.porteurAccess,
            accesRevoqueLe: compte.accesRevoqueLe,
          }
        : null,
    );
  }

  updatePorteurAccess(
    userId: number,
    porteurAccess: boolean,
    accesRevoqueLe: Date | null,
  ): Promise<void> {
    const compte = this.comptes.find((c) => c.userId === userId);
    if (compte) {
      compte.porteurAccess = porteurAccess;
      compte.accesRevoqueLe = accesRevoqueLe;
    }
    return Promise.resolve();
  }
}

const makeHarness = () => {
  const comptes: Compte[] = [
    {
      userId: INVESTISSEUR_ID,
      email: EMAIL,
      role: UserRole.INVESTISSEUR,
      porteurAccess: false,
      accesRevoqueLe: null,
      status: UserStatus.ACTIF,
    },
    {
      userId: PORTEUR_PUR_ID,
      email: 'porteur@example.com',
      role: UserRole.PORTEUR,
      porteurAccess: false,
      accesRevoqueLe: null,
      status: UserStatus.ACTIF,
    },
  ];
  const users = new InMemoryUserRepository(comptes);
  const demandes = new InMemoryDemandeAccesPorteurRepository();

  const sessionsInvalidees: string[] = [];
  const sessions = {
    invalidateRefreshTokenId: (email: string) => {
      sessionsInvalidees.push(email);
      return Promise.resolve();
    },
  };

  // Les doubles honorent les SIGNATURES réelles des vues restreintes (§ISP) —
  // ils ne les élargissent pas à `Record<string, unknown>`, sans quoi un
  // changement de contrat passerait inaperçu ici.
  const notificationsPoussees: Array<Record<string, unknown>> = [];
  const notifications: Notificateur = {
    push: (opts: PushNotificationOptions) => {
      notificationsPoussees.push({ ...opts });
      return Promise.resolve({} as NotificationEntity);
    },
    pushToRoles: (opts: PushAdminNotificationOptions) => {
      notificationsPoussees.push({ ...opts });
      return Promise.resolve([] as NotificationEntity[]);
    },
  };

  const entreesAudit: Array<{
    acteurId: string;
    action: string;
    objetId?: string;
    metadata?: Record<string, unknown>;
  }> = [];
  const audit: JournalAudit = {
    create: (
      acteurId: string,
      _role: string,
      action: string,
      _objetType?: string,
      objetId?: string,
      _ip?: string,
      _ua?: string,
      metadata?: Record<string, unknown>,
    ) => {
      entreesAudit.push({ acteurId, action, objetId, metadata });
      return Promise.resolve({} as AuditLogEntity);
    },
  };

  const soumettre = new SoumettreDemandePorteurUseCase(
    demandes,
    demandes,
    users as unknown as UserRepository,
    notifications,
    audit,
  );
  const instruire = new InstruireDemandePorteurUseCase(
    demandes,
    demandes,
    audit,
  );
  const decider = new DeciderDemandePorteurUseCase(
    demandes,
    demandes,
    users as unknown as UserRepository,
    sessions,
    notifications,
    audit,
  );
  const retirer = new RetirerDemandePorteurUseCase(demandes, demandes, audit);
  const statuerAcces = new StatuerAccesPorteurUseCase(
    users as unknown as UserRepository,
    sessions,
    notifications,
    audit,
  );

  const porteurAccessGuard = new PorteurAccessGuard(
    users as unknown as UserRepository,
  );

  return {
    comptes,
    demandes,
    users,
    sessionsInvalidees,
    notificationsPoussees,
    entreesAudit,
    soumettre,
    instruire,
    decider,
    retirer,
    statuerAcces,
    porteurAccessGuard,
  };
};

/** Contexte d'exécution minimal : un utilisateur déjà authentifié. */
const contexteHttp = (userId: number, role?: string): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { userId, role } }) }),
  }) as unknown as ExecutionContext;

describe('Cycle complet : soumission → examen → acceptation → accès effectif', () => {
  it("l'investisseur accepté entre dans l'espace porteur SANS changer de rôle", async () => {
    const h = makeHarness();

    // 1. Avant toute demande, la porte est fermée.
    await expect(
      h.porteurAccessGuard.canActivate(
        contexteHttp(INVESTISSEUR_ID, UserRole.INVESTISSEUR),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // 2. Dépôt de la demande.
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    expect(demande.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);

    // 3. Prise en charge par un instructeur.
    const enExamen = await h.instruire.execute({
      demandeId: demande.id as string,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    expect(enExamen.statut).toBe(StatutDemandeAccesPorteur.EN_EXAMEN);

    // 4. Acceptation.
    const resultat = await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    expect(resultat.porteurAccess).toBe(true);

    // 5. Le rôle N'A PAS changé — c'est le cœur de la décision D1.
    const compte = h.comptes.find((c) => c.userId === INVESTISSEUR_ID);
    expect(compte?.role).toBe(UserRole.INVESTISSEUR);
    expect(compte?.porteurAccess).toBe(true);

    // 6. La route porteur s'ouvre, alors que le jeton dit toujours
    //    « investisseur » : l'autorisation vient de la BASE, pas du claim.
    await expect(
      h.porteurAccessGuard.canActivate(
        contexteHttp(INVESTISSEUR_ID, UserRole.INVESTISSEUR),
      ),
    ).resolves.toBe(true);
  });

  it('un porteur « pur » garde son accès sans aucune demande', async () => {
    // Contre-épreuve : sans elle, un guard cassé qui exigerait le drapeau
    // ferait passer le test précédent tout en cassant tous les porteurs seed.
    const h = makeHarness();
    await expect(
      h.porteurAccessGuard.canActivate(
        contexteHttp(PORTEUR_PUR_ID, UserRole.PORTEUR),
      ),
    ).resolves.toBe(true);
  });

  it("l'accès retombe dès que le drapeau est retiré EN BASE (révocabilité)", async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await expect(
      h.porteurAccessGuard.canActivate(contexteHttp(INVESTISSEUR_ID)),
    ).resolves.toBe(true);

    // Retrait de l'accès en base, jeton inchangé.
    await h.users.updatePorteurAccess(INVESTISSEUR_ID, false, new Date());

    await expect(
      h.porteurAccessGuard.canActivate(contexteHttp(INVESTISSEUR_ID)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un compte inconnu est refusé', async () => {
    const h = makeHarness();
    await expect(
      h.porteurAccessGuard.canActivate(contexteHttp(999_999)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('une requête sans utilisateur est refusée', async () => {
    const h = makeHarness();
    const contexte = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    await expect(
      h.porteurAccessGuard.canActivate(contexte),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Octroi : session invalidée, notification, audit', () => {
  const accepter = async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    const resultat = await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    // Les notifications partent hors chemin critique (`.catch`) : on laisse la
    // micro-tâche s'exécuter avant d'observer.
    await new Promise(process.nextTick);
    return { h, resultat };
  };

  it('la session de la CIBLE est coupée', async () => {
    const { h, resultat } = await accepter();
    expect(h.sessionsInvalidees).toEqual([EMAIL]);
    expect(resultat.sessionInvalidee).toBe(true);
  });

  it("l'utilisateur est notifié de l'octroi", async () => {
    const { h } = await accepter();
    const notif = h.notificationsPoussees.find(
      (n) => n.type === 'porteur_access_accepte',
    );
    expect(notif).toBeDefined();
    expect(notif?.utilisateurId).toBe(INVESTISSEUR_ID);
    // La motivation de la personne ne ressort JAMAIS dans une notification.
    expect(JSON.stringify(notif)).not.toContain('immeuble');
  });

  it("la notification n'exige AUCUNE reconnexion — elle serait fausse", async () => {
    // Constaté en recette : l'accès est relu en base à chaque requête et le
    // front rafraîchit le profil de lui-même. Demander une reconnexion
    // ajoutait une friction inutile, à l'instant même où l'on annonce une
    // bonne nouvelle — et décrivait un produit qui n'existe pas.
    const { h } = await accepter();
    const notif = h.notificationsPoussees.find(
      (n) => n.type === 'porteur_access_accepte',
    );

    expect(notif?.message).not.toMatch(/reconnect/i);
    // Ce que la personne doit savoir : c'est ouvert, et où le trouver.
    expect(notif?.message).toContain('votre menu');
    expect(notif?.message).toContain('espace investisseur reste inchangé');
  });

  it("l'audit métier porte l'état AVANT et APRÈS, sans aucun texte libre", async () => {
    const { h } = await accepter();
    const entree = h.entreesAudit.find(
      (e) => e.action === 'porteur_access.demande.acceptee',
    );
    expect(entree).toBeDefined();
    expect(entree?.acteurId).toBe(String(ADMIN_ID));
    expect(entree?.metadata).toMatchObject({
      utilisateurId: INVESTISSEUR_ID,
      porteurAccessAvant: false,
      porteurAccessApres: true,
      sessionInvalidee: true,
    });
    // L'AuditInterceptor global ne connaît que le corps reçu : sans cette
    // entrée métier, l'état antérieur serait perdu.
    expect(JSON.stringify(entree)).not.toContain('immeuble');
  });

  it('la soumission est elle aussi auditée, sans le texte de la motivation', async () => {
    const h = makeHarness();
    await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    const entree = h.entreesAudit.find(
      (e) => e.action === 'porteur_access.demande.soumise',
    );
    expect(entree?.metadata).toEqual({
      longueurMotivation: MOTIVATION.length,
    });
    expect(JSON.stringify(entree)).not.toContain('immeuble');
  });

  it("l'équipe qui instruit est alertée du dépôt", async () => {
    const h = makeHarness();
    await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await new Promise(process.nextTick);
    const alerte = h.notificationsPoussees.find(
      (n) => n.type === 'porteur_access_demande',
    );
    expect(alerte).toBeDefined();
    // Destinataires = porteurs de la permission d'instruction, pas une liste
    // de rôles recopiée à la main.
    expect(alerte?.roles).toEqual(
      expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.COMPLIANCE]),
    );
    expect(JSON.stringify(alerte)).not.toContain('immeuble');
  });
});

describe('Refus', () => {
  /**
   * `motif` est passé TEL QUEL au use case (pas de valeur par défaut : un
   * `undefined` explicite doit rester `undefined` jusqu'au domaine, sans quoi
   * le cas « motif manquant » ne serait jamais éprouvé).
   */
  const refuser = async (motif: unknown, complement?: string) => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    const resultat = await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.REFUSEE,
      motifRefus: motif as MotifRefusAccesPorteur,
      motifRefusComplement: complement ?? null,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await new Promise(process.nextTick);
    return { h, resultat };
  };

  it("le motif codé est enregistré et l'accès reste fermé", async () => {
    const { h, resultat } = await refuser(MotifRefusAccesPorteur.HORS_CRITERES);
    expect(resultat.demande.statut).toBe(StatutDemandeAccesPorteur.REFUSEE);
    expect(resultat.demande.motifRefus).toBe(
      MotifRefusAccesPorteur.HORS_CRITERES,
    );
    expect(resultat.porteurAccess).toBe(false);
    await expect(
      h.porteurAccessGuard.canActivate(contexteHttp(INVESTISSEUR_ID)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sans motif codé, rien n’est écrit (400)', async () => {
    await expect(refuser(undefined)).rejects.toBeInstanceOf(
      MotifRefusRequisError,
    );
    await expect(refuser('parce que non')).rejects.toBeInstanceOf(
      MotifRefusRequisError,
    );
  });

  it('la notification porte le LIBELLÉ du motif, jamais le complément interne', async () => {
    const { h } = await refuser(
      MotifRefusAccesPorteur.DOSSIER_INCOMPLET,
      'RIB illisible, relancer le 12',
    );
    const notif = h.notificationsPoussees.find(
      (n) => n.type === 'porteur_access_refuse',
    );
    expect(notif?.message).toContain('Demande incomplète');
    expect(JSON.stringify(notif)).not.toContain('RIB illisible');
    expect(JSON.stringify(notif)).not.toContain('immeuble');
  });

  it("l'audit du refus retient le CODE, pas le complément", async () => {
    const { h } = await refuser(
      MotifRefusAccesPorteur.OBSTACLE_LEGAL_LCBFT,
      'note interne confidentielle',
    );
    const entree = h.entreesAudit.find(
      (e) => e.action === 'porteur_access.demande.refusee',
    );
    expect(entree?.metadata).toMatchObject({
      motifRefus: MotifRefusAccesPorteur.OBSTACLE_LEGAL_LCBFT,
      porteurAccessApres: false,
    });
    expect(JSON.stringify(entree)).not.toContain('note interne');
  });

  it("un refus n'invalide pas la session d'un compte qui n'avait pas l'accès", async () => {
    const { h, resultat } = await refuser(MotifRefusAccesPorteur.HORS_CRITERES);
    expect(h.sessionsInvalidees).toEqual([]);
    expect(resultat.sessionInvalidee).toBe(false);
  });
});

describe('Double soumission et carence', () => {
  it('une seconde demande alors qu’une est en cours est refusée (409)', async () => {
    const h = makeHarness();
    await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await expect(
      h.soumettre.execute({
        utilisateurId: INVESTISSEUR_ID,
        motivation: MOTIVATION,
      }),
    ).rejects.toBeInstanceOf(DemandeAccesPorteurEnCoursError);
  });

  it('même refus quand la demande est passée en examen', async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await h.instruire.execute({
      demandeId: demande.id as string,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await expect(
      h.soumettre.execute({
        utilisateurId: INVESTISSEUR_ID,
        motivation: MOTIVATION,
      }),
    ).rejects.toBeInstanceOf(DemandeAccesPorteurEnCoursError);
  });

  it('le dépôt du dépôt lui-même refuse le doublon (invariant du DÉPÔT, pas du use case)', async () => {
    // Réplique de l'index unique partiel : même sous concurrence, c'est la
    // couche de persistance qui tranche.
    const h = makeHarness();
    await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    expect(() =>
      h.demandes.creer(
        DemandeAccesPorteur.soumettre({
          utilisateurId: INVESTISSEUR_ID,
          motivation: MOTIVATION,
        }),
      ),
    ).toThrow(DemandeAccesPorteurEnCoursError);
  });

  it('refus puis nouvelle demande sous 30 jours : 429', async () => {
    const h = makeHarness();
    const t0 = new Date('2026-09-01T10:00:00.000Z');
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
      maintenant: t0,
    });
    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.REFUSEE,
      motifRefus: MotifRefusAccesPorteur.HORS_CRITERES,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: t0,
    });

    const veille = new Date(
      t0.getTime() + (DELAI_CARENCE_APRES_REFUS_JOURS - 1) * 86_400_000,
    );
    await expect(
      h.soumettre.execute({
        utilisateurId: INVESTISSEUR_ID,
        motivation: MOTIVATION,
        maintenant: veille,
      }),
    ).rejects.toBeInstanceOf(DemandeTropRapprocheeError);

    // …et redevient recevable une fois la carence écoulée.
    const apres = new Date(
      t0.getTime() + (DELAI_CARENCE_APRES_REFUS_JOURS + 1) * 86_400_000,
    );
    const seconde = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
      maintenant: apres,
    });
    expect(seconde.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
  });

  it('un retrait volontaire n’ouvre AUCUNE carence', async () => {
    const h = makeHarness();
    const t0 = new Date('2026-09-01T10:00:00.000Z');
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
      maintenant: t0,
    });
    await h.retirer.execute({
      demandeId: demande.id as string,
      utilisateurId: INVESTISSEUR_ID,
      maintenant: t0,
    });
    const seconde = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
      maintenant: new Date(t0.getTime() + 60_000),
    });
    expect(seconde.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
  });

  // ── La date de réintroduction est SERVIE, pas seulement opposée ──────────
  //
  // Elle ne vivait que dans le corps du 429 : le demandeur éconduit devait
  // RETENTER pour apprendre quand il pourrait retenter. Le front avait
  // l'affichage prêt, le champ n'existait pas.

  it('après un refus, la vue du demandeur porte la date de réintroduction', async () => {
    const h = makeHarness();
    const t0 = new Date('2026-09-01T10:00:00.000Z');
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
      maintenant: t0,
    });
    const { demande: refusee } = await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.REFUSEE,
      motifRefus: MotifRefusAccesPorteur.HORS_CRITERES,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: t0,
    });

    // Exactement ce que rend `GET /porteur-access/demandes/me`.
    const vue = versVueDemandeur(refusee);

    expect(vue.reintroductibleLe).toBe(
      new Date(
        t0.getTime() + DELAI_CARENCE_APRES_REFUS_JOURS * 86_400_000,
      ).toISOString(),
    );
  });

  it('la date servie est EXACTEMENT celle que le refus 429 oppose', async () => {
    // Non-divergence : la vue et la garde lisent la même fonction de domaine.
    // Deux calculs séparés auraient fini par annoncer une date et en opposer
    // une autre — le pire des deux mondes pour le demandeur.
    const h = makeHarness();
    const t0 = new Date('2026-09-01T10:00:00.000Z');
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
      maintenant: t0,
    });
    const { demande: refusee } = await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.REFUSEE,
      motifRefus: MotifRefusAccesPorteur.HORS_CRITERES,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: t0,
    });

    const erreur = await h.soumettre
      .execute({
        utilisateurId: INVESTISSEUR_ID,
        motivation: MOTIVATION,
        maintenant: new Date(t0.getTime() + 86_400_000),
      })
      .catch((e: unknown) => e as DemandeTropRapprocheeError);

    expect(erreur).toBeInstanceOf(DemandeTropRapprocheeError);
    expect((erreur as DemandeTropRapprocheeError).details).toMatchObject({
      reintroductibleLe: versVueDemandeur(refusee).reintroductibleLe,
    });
  });

  it.each([
    ['une demande en cours', StatutDemandeAccesPorteur.SOUMISE],
    ['une demande acceptée', StatutDemandeAccesPorteur.ACCEPTEE],
  ])('%s ne porte AUCUNE date de réintroduction', async (_nom, decision) => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });

    if (decision === StatutDemandeAccesPorteur.SOUMISE) {
      expect(versVueDemandeur(demande).reintroductibleLe).toBeNull();
      return;
    }

    const { demande: acceptee } = await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    expect(versVueDemandeur(acceptee).reintroductibleLe).toBeNull();
  });

  it('un retrait volontaire ne porte pas non plus de date de réintroduction', async () => {
    // Cohérent avec la règle : se retirer soi-même n'ouvre aucune carence.
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    const retiree = await h.retirer.execute({
      demandeId: demande.id as string,
      utilisateurId: INVESTISSEUR_ID,
    });

    expect(versVueDemandeur(retiree).reintroductibleLe).toBeNull();
  });

  it('un compte qui a DÉJÀ l’accès ne peut pas redemander (409)', async () => {
    const h = makeHarness();
    await h.users.updatePorteurAccess(INVESTISSEUR_ID, true, null);
    await expect(
      h.soumettre.execute({
        utilisateurId: INVESTISSEUR_ID,
        motivation: MOTIVATION,
      }),
    ).rejects.toBeInstanceOf(AccesPorteurDejaOuvertError);
  });

  it('un porteur « pur » n’est pas éligible à la demande (403)', async () => {
    const h = makeHarness();
    await expect(
      h.soumettre.execute({
        utilisateurId: PORTEUR_PUR_ID,
        motivation: MOTIVATION,
      }),
    ).rejects.toBeInstanceOf(RoleNonEligibleError);
  });
});

describe('Retrait par le demandeur', () => {
  it('retire sa propre demande tant qu’elle n’est pas décidée', async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    const retiree = await h.retirer.execute({
      demandeId: demande.id as string,
      utilisateurId: INVESTISSEUR_ID,
    });
    expect(retiree.statut).toBe(StatutDemandeAccesPorteur.RETIREE);
  });

  it('ne peut pas retirer la demande d’un autre (403)', async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await expect(
      h.retirer.execute({
        demandeId: demande.id as string,
        utilisateurId: PORTEUR_PUR_ID,
      }),
    ).rejects.toBeInstanceOf(DemandeAccesPorteurEtrangereError);
  });

  it('ne peut plus retirer après décision (409)', async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await expect(
      h.retirer.execute({
        demandeId: demande.id as string,
        utilisateurId: INVESTISSEUR_ID,
      }),
    ).rejects.toBeInstanceOf(TransitionDemandeInterditeError);
  });

  it('une demande inconnue est un 404, quel que soit l’appelant', async () => {
    const h = makeHarness();
    await expect(
      h.retirer.execute({
        demandeId: 'inexistante',
        utilisateurId: INVESTISSEUR_ID,
      }),
    ).rejects.toBeInstanceOf(DemandeAccesPorteurIntrouvableError);
    await expect(
      h.instruire.execute({
        demandeId: 'inexistante',
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      }),
    ).rejects.toBeInstanceOf(DemandeAccesPorteurIntrouvableError);
  });
});

/**
 * Anomalie de recette (MAJEUR) : un compte supprimé puis anonymisé gardait sa
 * demande en `soumise`. La faire accepter renvoyait 200, écrivait
 * `porteurAccess = true` sur un compte sans identité et produisait une entrée
 * d'audit dénuée de sens.
 *
 * Deux ceintures indépendantes. Celle-ci est la seconde : le use case refuse.
 * La première — la caducité posée au moment de l'anonymisation — est éprouvée
 * dans `anonymize-account.service.spec.ts`.
 */
describe("Décision sur un compte qui n'est plus actif", () => {
  const prepare = async (status: UserStatus) => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    const compte = h.comptes.find((c) => c.userId === INVESTISSEUR_ID);
    if (compte) compte.status = status;
    return { h, demande };
  };

  it.each([
    ['supprimé', UserStatus.SUPPRIME],
    ['clos', UserStatus.CLOS],
    ['suspendu', UserStatus.SUSPENDU],
  ])(
    "refuse d'ACCEPTER la demande d'un compte %s (409)",
    async (_cas, status) => {
      const { h, demande } = await prepare(status);

      await expect(
        h.decider.execute({
          demandeId: demande.id as string,
          decision: StatutDemandeAccesPorteur.ACCEPTEE,
          decideurAdminId: ADMIN_ID,
          decideurRole: UserRole.COMPLIANCE,
        }),
      ).rejects.toBeInstanceOf(CompteInactifError);

      // Rien n'a bougé : ni le drapeau, ni le dossier.
      expect(
        h.comptes.find((c) => c.userId === INVESTISSEUR_ID)?.porteurAccess,
      ).toBe(false);
      const relue = await h.demandes.findById(demande.id as string);
      expect(relue?.statut).toBe(StatutDemandeAccesPorteur.SOUMISE);
    },
  );

  it("refuse aussi de REFUSER : on ne clôt pas un dossier au nom d'un absent", async () => {
    const { h, demande } = await prepare(UserStatus.SUPPRIME);

    await expect(
      h.decider.execute({
        demandeId: demande.id as string,
        decision: StatutDemandeAccesPorteur.REFUSEE,
        motifRefus: MotifRefusAccesPorteur.HORS_CRITERES,
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      }),
    ).rejects.toBeInstanceOf(CompteInactifError);
  });

  it("l'erreur porte un code stable et se traduit en 409", async () => {
    const { h, demande } = await prepare(UserStatus.SUPPRIME);
    await h.decider
      .execute({
        demandeId: demande.id as string,
        decision: StatutDemandeAccesPorteur.ACCEPTEE,
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      })
      .catch((erreur: CompteInactifError) => {
        expect(erreur.code).toBe('PORTEUR_ACCESS_COMPTE_INACTIF');
        expect(statutHttpDeLErreur(erreur)).toBe(409);
      });
    expect.assertions(2);
  });

  it('CONTRE-ÉPREUVE : un compte actif reste décidable', async () => {
    const { h, demande } = await prepare(UserStatus.ACTIF);
    const resultat = await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    expect(resultat.porteurAccess).toBe(true);
  });

  it("la file d'instruction n'affiche plus le dossier d'un compte disparu", async () => {
    // Troisième ceinture : même si un dossier survivait aux deux premières, il
    // ne remonterait plus dans la file — donc plus d'alerte J+25 fantôme.
    const { h, demande } = await prepare(UserStatus.SUPPRIME);
    h.demandes.marquerCompteClos(INVESTISSEUR_ID);

    const file = await h.demandes.lister({});
    expect(file.total).toBe(0);
    // …mais le dossier existe toujours pour qui le demande par son identifiant.
    await expect(
      h.demandes.findById(demande.id as string),
    ).resolves.not.toBeNull();
  });
});

describe('Décision déjà rendue', () => {
  it('re-décider une demande close est refusé (409) et ne réécrit pas le drapeau', async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });

    await expect(
      h.decider.execute({
        demandeId: demande.id as string,
        decision: StatutDemandeAccesPorteur.REFUSEE,
        motifRefus: MotifRefusAccesPorteur.HORS_CRITERES,
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      }),
    ).rejects.toBeInstanceOf(TransitionDemandeInterditeError);

    // L'accès accordé n'a pas bougé : la transition est éprouvée AVANT toute
    // écriture.
    expect(
      h.comptes.find((c) => c.userId === INVESTISSEUR_ID)?.porteurAccess,
    ).toBe(true);
  });
});

/**
 * Anomalie de validation (P0, S2) : le lot 4 avait livré l'OCTROI sans son
 * inverse. Un accès accordé ne pouvait plus se refermer, alors que la clause
 * CGU de retrait exige une mesure MOTIVÉE, NOTIFIÉE et RÉVERSIBLE.
 *
 * Ces tests éprouvent la chaîne réelle : vrai use case, vrai garde relu en
 * base — c'est-à-dire la seule chose qui compte, « l'accès est-il coupé à la
 * requête SUIVANTE ? ».
 */
describe("Retrait et rétablissement de l'accès porteur", () => {
  /** Amène le compte investisseur à « accès ouvert » par le parcours normal. */
  const avecAccesOuvert = async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    // On repart d'observations propres : l'octroi a déjà notifié et audité.
    h.sessionsInvalidees.length = 0;
    h.notificationsPoussees.length = 0;
    h.entreesAudit.length = 0;
    return { h, demande };
  };

  it("coupe l'accès à la requête SUIVANTE (garde relu en base)", async () => {
    const { h } = await avecAccesOuvert();
    await expect(
      h.porteurAccessGuard.canActivate(contexteHttp(INVESTISSEUR_ID)),
    ).resolves.toBe(true);

    const resultat = await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: T_RETRAIT,
    });

    expect(resultat.porteurAccess).toBe(false);
    expect(resultat.accesRevoqueLe).toEqual(T_RETRAIT);

    // Le jeton n'a pas changé : c'est la BASE qui décide.
    await expect(
      h.porteurAccessGuard.canActivate(
        contexteHttp(INVESTISSEUR_ID, UserRole.INVESTISSEUR),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('horodate le retrait EN BASE — point de départ du barème de conservation', async () => {
    const { h } = await avecAccesOuvert();
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.CRITERES_NON_MAINTENUS,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: T_RETRAIT,
    });
    const compte = h.comptes.find((c) => c.userId === INVESTISSEUR_ID);
    expect(compte?.accesRevoqueLe).toEqual(T_RETRAIT);
    // Le RÔLE n'a pas bougé : retirer l'accès porteur n'est pas rétrograder.
    expect(compte?.role).toBe(UserRole.INVESTISSEUR);
  });

  it("rétablit l'accès et EFFACE l'horodatage (réversibilité)", async () => {
    const { h } = await avecAccesOuvert();
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.OCTROI_ERRONE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: T_RETRAIT,
    });

    const resultat = await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: true,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });

    expect(resultat.porteurAccess).toBe(true);
    expect(resultat.accesRevoqueLe).toBeNull();
    expect(
      h.comptes.find((c) => c.userId === INVESTISSEUR_ID)?.accesRevoqueLe,
    ).toBeNull();
    await expect(
      h.porteurAccessGuard.canActivate(contexteHttp(INVESTISSEUR_ID)),
    ).resolves.toBe(true);
  });

  it('refuse le no-op (409) sans rien écrire ni notifier', async () => {
    const h = makeHarness();
    await expect(
      h.statuerAcces.execute({
        utilisateurId: INVESTISSEUR_ID,
        acces: false,
        motif: MotifRetraitAccesPorteur.OCTROI_ERRONE,
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      }),
    ).rejects.toBeInstanceOf(AccesPorteurEtatInchangeError);

    await new Promise(process.nextTick);
    expect(h.notificationsPoussees).toEqual([]);
    expect(h.entreesAudit).toEqual([]);
    expect(h.sessionsInvalidees).toEqual([]);
  });

  it("refuse le retrait sans motif codé (400), rien n'est écrit", async () => {
    const { h } = await avecAccesOuvert();
    await expect(
      h.statuerAcces.execute({
        utilisateurId: INVESTISSEUR_ID,
        acces: false,
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      }),
    ).rejects.toBeInstanceOf(MotifRetraitRequisError);

    expect(
      h.comptes.find((c) => c.userId === INVESTISSEUR_ID)?.porteurAccess,
    ).toBe(true);
  });

  it("refuse d'agir sur un compte inactif (409, code réutilisé)", async () => {
    const { h } = await avecAccesOuvert();
    const compte = h.comptes.find((c) => c.userId === INVESTISSEUR_ID);
    if (compte) compte.status = UserStatus.SUSPENDU;

    await h.statuerAcces
      .execute({
        utilisateurId: INVESTISSEUR_ID,
        acces: false,
        motif: MotifRetraitAccesPorteur.OBSTACLE_LEGAL_LCBFT,
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      })
      .catch((erreur: CompteInactifError) => {
        expect(erreur.code).toBe('PORTEUR_ACCESS_COMPTE_INACTIF');
        expect(statutHttpDeLErreur(erreur)).toBe(409);
      });
    expect(compte?.porteurAccess).toBe(true);
    expect.assertions(3);
  });

  it('un compte inconnu est un 404', async () => {
    const h = makeHarness();
    await expect(
      h.statuerAcces.execute({
        utilisateurId: 999_999,
        acces: true,
        decideurAdminId: ADMIN_ID,
        decideurRole: UserRole.COMPLIANCE,
      }),
    ).rejects.toBeInstanceOf(CompteIntrouvableError);
  });

  it('coupe la session de la CIBLE', async () => {
    const { h } = await avecAccesOuvert();
    const resultat = await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    expect(h.sessionsInvalidees).toEqual([EMAIL]);
    expect(resultat.sessionInvalidee).toBe(true);
  });

  it('NOTIFIE le titulaire — libellé du motif codé, aucun texte libre', async () => {
    const { h } = await avecAccesOuvert();
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await new Promise(process.nextTick);

    const notif = h.notificationsPoussees.find(
      (n) => n.type === 'porteur_access_revoque',
    );
    expect(notif).toBeDefined();
    expect(notif?.utilisateurId).toBe(INVESTISSEUR_ID);
    expect(notif?.message).toContain(
      LIBELLES_MOTIF_RETRAIT[MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL],
    );
    // La motivation de la personne ne ressort JAMAIS d'une notification, et
    // aucun autre texte libre n'existe sur ce chemin.
    expect(JSON.stringify(notif)).not.toContain('immeuble');
  });

  it('notifie aussi le RÉTABLISSEMENT', async () => {
    const { h } = await avecAccesOuvert();
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.DEMANDE_DU_TITULAIRE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: true,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await new Promise(process.nextTick);

    const notif = h.notificationsPoussees.find(
      (n) => n.type === 'porteur_access_retabli',
    );
    expect(notif).toBeDefined();
    // Même correction qu'à l'octroi : aucune reconnexion n'est nécessaire,
    // l'accès étant relu en base à chaque requête.
    expect(notif?.message).not.toMatch(/reconnect/i);
    expect(notif?.message).toContain('votre menu');
  });

  it("l'audit porte l'état AVANT et APRÈS, et le motif CODÉ", async () => {
    const { h } = await avecAccesOuvert();
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.OBSTACLE_LEGAL_LCBFT,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: T_RETRAIT,
    });

    const entree = h.entreesAudit.find(
      (e) => e.action === 'porteur_access.acces.retire',
    );
    expect(entree).toBeDefined();
    expect(entree?.acteurId).toBe(String(ADMIN_ID));
    expect(entree?.objetId).toBe(String(INVESTISSEUR_ID));
    expect(entree?.metadata).toMatchObject({
      utilisateurId: INVESTISSEUR_ID,
      porteurAccessAvant: true,
      porteurAccessApres: false,
      motifRetrait: MotifRetraitAccesPorteur.OBSTACLE_LEGAL_LCBFT,
      accesRevoqueLe: T_RETRAIT.toISOString(),
      sessionInvalidee: true,
    });
  });

  it('le rétablissement est audité lui aussi', async () => {
    const { h } = await avecAccesOuvert();
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.OCTROI_ERRONE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: true,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });

    const entree = h.entreesAudit.find(
      (e) => e.action === 'porteur_access.acces.retabli',
    );
    expect(entree?.metadata).toMatchObject({
      porteurAccessAvant: false,
      porteurAccessApres: true,
      motifRetrait: null,
      accesRevoqueLe: null,
    });
  });

  it("n'altère AUCUNE demande : la preuve de l'examen initial survit", async () => {
    const { h, demande } = await avecAccesOuvert();
    await h.statuerAcces.execute({
      utilisateurId: INVESTISSEUR_ID,
      acces: false,
      motif: MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });

    const relue = await h.demandes.findById(demande.id as string);
    expect(relue?.statut).toBe(StatutDemandeAccesPorteur.ACCEPTEE);
    expect(relue?.decideurAdminId).toBe(ADMIN_ID);
  });
});

describe('Refus qui REFERME un accès ouvert', () => {
  it('horodate le retrait, comme une révocation', async () => {
    // Chemin rare mais réel : l'accès a été ouvert (par un rétablissement),
    // une nouvelle demande traîne, et elle est refusée. Le refus referme
    // l'accès — c'est un retrait, il doit s'horodater sous peine de fausser le
    // point de départ du barème.
    const h = makeHarness();
    await h.users.updatePorteurAccess(INVESTISSEUR_ID, true, null);
    const demande = await h.demandes.creer(
      DemandeAccesPorteur.soumettre({
        utilisateurId: INVESTISSEUR_ID,
        motivation: MOTIVATION,
      }),
    );

    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.REFUSEE,
      motifRefus: MotifRefusAccesPorteur.HORS_CRITERES,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: T_RETRAIT,
    });

    const compte = h.comptes.find((c) => c.userId === INVESTISSEUR_ID);
    expect(compte?.porteurAccess).toBe(false);
    expect(compte?.accesRevoqueLe).toEqual(T_RETRAIT);
  });

  it('un refus sur un compte sans accès ne pose AUCUN horodatage', async () => {
    const h = makeHarness();
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.REFUSEE,
      motifRefus: MotifRefusAccesPorteur.HORS_CRITERES,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
      maintenant: T_RETRAIT,
    });
    expect(
      h.comptes.find((c) => c.userId === INVESTISSEUR_ID)?.accesRevoqueLe,
    ).toBeNull();
  });

  it('une acceptation EFFACE un horodatage antérieur', async () => {
    // Un compte dont l'accès avait été retiré redépose et obtient gain de
    // cause : l'accès court de nouveau, la date de fermeture n'a plus d'objet.
    const h = makeHarness();
    await h.users.updatePorteurAccess(INVESTISSEUR_ID, false, T_RETRAIT);
    const demande = await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    await h.decider.execute({
      demandeId: demande.id as string,
      decision: StatutDemandeAccesPorteur.ACCEPTEE,
      decideurAdminId: ADMIN_ID,
      decideurRole: UserRole.COMPLIANCE,
    });

    const compte = h.comptes.find((c) => c.userId === INVESTISSEUR_ID);
    expect(compte?.porteurAccess).toBe(true);
    expect(compte?.accesRevoqueLe).toBeNull();
  });
});

describe("File d'instruction : état du compte demandeur", () => {
  it('chaque ligne porte le statut, la suspension et la décidabilité', async () => {
    // Anomalie de validation (S8) : un compte SUSPENDU n'est ni clos ni
    // supprimé, son dossier reste donc listé — et toute décision renvoyait 409
    // sans que l'instructeur puisse comprendre pourquoi.
    const h = makeHarness();
    await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    h.demandes.definirStatutCompte(INVESTISSEUR_ID, UserStatus.SUSPENDU);

    const page = await h.demandes.lister({});
    const vue = versLigneFile(page.items[0]);

    expect(vue.statutCompte).toBe(UserStatus.SUSPENDU);
    expect(vue.compteSuspendu).toBe(true);
    expect(vue.decisionPossible).toBe(false);
    // La vue instructeur du dossier lui-même est inchangée.
    expect(vue.utilisateurId).toBe(INVESTISSEUR_ID);
  });

  it('un compte actif reste décidable et non suspendu', async () => {
    const h = makeHarness();
    await h.soumettre.execute({
      utilisateurId: INVESTISSEUR_ID,
      motivation: MOTIVATION,
    });
    h.demandes.definirStatutCompte(INVESTISSEUR_ID, UserStatus.ACTIF);

    const vue = versLigneFile((await h.demandes.lister({})).items[0]);
    expect(vue.compteSuspendu).toBe(false);
    expect(vue.decisionPossible).toBe(true);
  });
});

describe('Autorisation des routes du back-office', () => {
  const reflector = new Reflector();
  const permissions = new PermissionsGuard(reflector);

  const contexteAdmin = (
    controleur: new (...args: never[]) => unknown,
    methode: string,
    role: string | undefined,
  ) =>
    ({
      getHandler: () => (controleur.prototype as never)[methode],
      getClass: () => controleur,
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : {} }),
      }),
    }) as unknown as ExecutionContext;

  // Le contrôleur RÉEL : ce sont ses propres métadonnées de permission qui
  // sont éprouvées, pas une copie de la déclaration.
  const AdminControleur = AdminPorteurAccessController;

  it.each(['lister', 'statuer', 'statuerAccesPorteur'])(
    'un rôle sans porteur_access:review reçoit 403 sur %s',
    (methode) => {
      for (const role of [
        UserRole.INVESTISSEUR,
        UserRole.PORTEUR,
        UserRole.SUPPORT,
        UserRole.MARKETING,
        UserRole.FINANCIER,
        UserRole.CIO,
        UserRole.ANALYSTE_FINANCIER,
        UserRole.DPO,
        UserRole.RCCI,
        UserRole.CGP,
        UserRole.CHARGE_RELATION_INVESTISSEUR,
      ]) {
        expect(() =>
          permissions.canActivate(
            contexteAdmin(AdminControleur, methode, role),
          ),
        ).toThrow(ForbiddenException);
      }
    },
  );

  it.each(['lister', 'statuer', 'statuerAccesPorteur'])(
    'compliance et super_admin passent sur %s',
    (methode) => {
      expect(
        permissions.canActivate(
          contexteAdmin(AdminControleur, methode, UserRole.COMPLIANCE),
        ),
      ).toBe(true);
      expect(
        permissions.canActivate(
          contexteAdmin(AdminControleur, methode, UserRole.SUPER_ADMIN),
        ),
      ).toBe(true);
    },
  );

  it('une requête sans rôle est refusée', () => {
    expect(() =>
      permissions.canActivate(
        contexteAdmin(AdminControleur, 'lister', undefined),
      ),
    ).toThrow(ForbiddenException);
  });
});

describe('Autorisation des routes utilisateur', () => {
  const roles = new RolesGuard(new Reflector());

  const contexteRole = (
    controleur: new (...args: never[]) => unknown,
    methode: string,
    role: string,
  ) =>
    ({
      getHandler: () => (controleur.prototype as never)[methode],
      getClass: () => controleur,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as unknown as ExecutionContext;

  const Controleur = PorteurAccessController;

  it('la demande est réservée aux investisseurs', () => {
    expect(
      roles.canActivate(
        contexteRole(Controleur, 'soumettreDemande', UserRole.INVESTISSEUR),
      ),
    ).toBe(true);
    for (const role of [UserRole.PORTEUR, UserRole.SUPER_ADMIN, UserRole.CGP]) {
      expect(() =>
        roles.canActivate(contexteRole(Controleur, 'soumettreDemande', role)),
      ).toThrow(ForbiddenException);
    }
  });
});

describe("Gardes des routes de l'espace porteur", () => {
  const reflector = new Reflector();

  /** Le `@Roles(PORTEUR)` a-t-il disparu de la cible ? */
  const rolesExigesSur = (cible: unknown) =>
    reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      cible,
      cible,
    ] as never);

  it("PorteurController n'exige plus le RÔLE porteur (sinon D1 est mort-né)", () => {
    // Cumuler `@Roles(PORTEUR)` et le nouveau garde refermerait la porte
    // qu'on vient d'ouvrir : le RolesGuard global s'exécute AVANT.
    expect(Reflect.getMetadata(ROLES_KEY, PorteurController)).toBeUndefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, PorteurTresorerieController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        ProjectController.prototype.submitByPorteur,
      ),
    ).toBeUndefined();
    expect(rolesExigesSur(PorteurController)).toBeUndefined();
  });

  it.each([
    ['PorteurController (classe)', PorteurController],
    ['PorteurTresorerieController (classe)', PorteurTresorerieController],
  ])('%s est gardé par PorteurAccessGuard', (_nom, controleur) => {
    const gardes = Reflect.getMetadata('__guards__', controleur) ?? [];
    expect(gardes).toContain(PorteurAccessGuard);
  });

  it('POST /projects/submit est gardé par PorteurAccessGuard', () => {
    const gardes =
      Reflect.getMetadata(
        '__guards__',
        ProjectController.prototype.submitByPorteur,
      ) ?? [];
    expect(gardes).toContain(PorteurAccessGuard);
  });

  it("AUCUNE autre route de ProjectController n'a été desserrée", () => {
    // Le durcissement ne doit pas déborder : `create` reste sur sa permission,
    // `submit` est le seul point ouvert au double accès.
    const permissionsDeCreate = reflector.getAllAndOverride(PERMISSIONS_KEY, [
      ProjectController.prototype.create,
      ProjectController,
    ] as never);
    expect(permissionsDeCreate).toEqual(['projects:manage']);

    const gardesDeCreate =
      Reflect.getMetadata('__guards__', ProjectController.prototype.create) ??
      [];
    expect(gardesDeCreate).not.toContain(PorteurAccessGuard);
  });

  it('les routes publiques du catalogue restent publiques', () => {
    expect(
      reflector.getAllAndOverride(IS_PUBLIC_KEY, [
        ProjectController.prototype.listPublic,
        ProjectController,
      ] as never),
    ).toBe(true);
  });
});
