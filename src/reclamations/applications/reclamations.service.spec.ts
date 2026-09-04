import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReclamationsService } from './reclamations.service';
import { StatutReclamation } from '../domains/reclamation';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import {
  hasPermission,
  rolesWithPermission,
} from 'src/common/auth/permissions.constants';

/**
 * Habilitation d'accès aux réclamations.
 *
 * ## Le défaut corrigé
 *
 * Le presenter calculait « est back-office » par EXCLUSION d'un seul rôle :
 * `user.role !== 'investisseur'`. Tout compte `porteur`, `cgp`, `marketing`,
 * `cio`, `financier`, `analyste_financier`, `charge_relation_investisseur`,
 * `dpo` — dont AUCUN ne détient `reclamations:manage` — lisait ainsi n'importe
 * quelle réclamation : identité du plaignant, récit du litige, réponse de la
 * plateforme. Un rôle inconnu (jeton d'avant migration) passait également.
 *
 * Ce fichier éprouve la règle sur la matrice RÉELLE des permissions, rôle par
 * rôle : ajouter demain un rôle habilité dans `ROLE_PERMISSIONS` fera bouger
 * ces tests avec le code, sans qu'une liste dupliquée ici ne dérive.
 */
describe('ReclamationsService — habilitation', () => {
  const DEMANDEUR_ID = 10;
  const AUTRE_INVESTISSEUR_ID = 11;

  const reclamation = () => ({
    id: 'rec-1',
    reference: 'REC-2026-0001',
    utilisateurId: DEMANDEUR_ID,
    objet: 'Retard de distribution',
    description: 'Le coupon de juin n’a pas été versé.',
    statut: StatutReclamation.ACCUSE_RECEPTION,
    accuseReceptionLe: new Date('2026-06-01T10:00:00.000Z'),
    echeanceReponse: new Date('2026-08-01T10:00:00.000Z'),
    reponduLe: null,
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
  });

  const construire = () => {
    const repo = {
      findOne: jest.fn(async () => reclamation()),
      find: jest.fn(async () => [reclamation()]),
      save: jest.fn(async (r: unknown) => r),
      create: jest.fn((r: unknown) => r),
      count: jest.fn(async () => 0),
    };
    return { service: new ReclamationsService(repo as any), repo };
  };

  /** Tous les rôles du dépôt, plus les cas dégradés d'un jeton. */
  const TOUS_LES_ROLES = Object.values(UserRole);
  const ROLES_HABILITES = rolesWithPermission('reclamations:manage');

  describe('consulter', () => {
    it('le DEMANDEUR consulte sa propre réclamation', async () => {
      const { service } = construire();

      const resultat = await service.consulter('rec-1', {
        userId: DEMANDEUR_ID,
        role: UserRole.INVESTISSEUR,
      });

      expect(resultat.id).toBe('rec-1');
      expect(resultat.delais).toBeDefined();
    });

    it('un AUTRE investisseur est refusé (403) — anti-IDOR', async () => {
      const { service } = construire();

      await expect(
        service.consulter('rec-1', {
          userId: AUTRE_INVESTISSEUR_ID,
          role: UserRole.INVESTISSEUR,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(
      TOUS_LES_ROLES.filter((r) => !hasPermission(r, 'reclamations:manage')),
    )(
      'le rôle %s, sans reclamations:manage, ne lit pas la réclamation d’autrui (403)',
      async (role) => {
        // Couvre nommément porteur, cgp et marketing, et tous les autres rôles
        // que l'ancien test par exclusion laissait passer.
        const { service } = construire();

        await expect(
          service.consulter('rec-1', {
            userId: AUTRE_INVESTISSEUR_ID,
            role,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    it.each(ROLES_HABILITES)(
      'le rôle %s, habilité par la matrice, consulte la réclamation d’autrui',
      async (role) => {
        const { service } = construire();

        await expect(
          service.consulter('rec-1', {
            userId: AUTRE_INVESTISSEUR_ID,
            role,
          }),
        ).resolves.toMatchObject({ id: 'rec-1' });
      },
    );

    it('la matrice habilite bien les quatre rôles attendus, et eux seuls', () => {
      // Verrou explicite : si un rôle gagne ou perd `reclamations:manage`,
      // cette ligne le dit — le test précédent, lui, suivrait en silence.
      expect([...ROLES_HABILITES].sort()).toEqual(
        [
          UserRole.SUPER_ADMIN,
          UserRole.COMPLIANCE,
          UserRole.SUPPORT,
          UserRole.RCCI,
        ].sort(),
      );
    });

    it('un rôle absent ou inconnu du jeton ne donne aucun accès', async () => {
      const { service } = construire();

      await expect(
        service.consulter('rec-1', { userId: AUTRE_INVESTISSEUR_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.consulter('rec-1', {
          userId: AUTRE_INVESTISSEUR_ID,
          role: 'admin', // rôle legacy d'un jeton émis avant la migration
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('réclamation introuvable → 404, avant toute question d’habilitation', async () => {
      const { service, repo } = construire();
      repo.findOne.mockResolvedValue(null as never);

      await expect(
        service.consulter('rec-absente', {
          userId: DEMANDEUR_ID,
          role: UserRole.INVESTISSEUR,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── Défense en profondeur des routes de back-office ───────────────────────
  //
  // Ces routes portent `@RequirePermission('reclamations:manage')`. Le service
  // ne s'en remet plus au décorateur : il vérifie lui-même.

  describe('routes de traitement — le service vérifie aussi', () => {
    it.each([
      [
        'listerPourBackOffice',
        (s: ReclamationsService, appelant: any) =>
          s.listerPourBackOffice(appelant),
      ],
      [
        'prendreEnInstruction',
        (s: ReclamationsService, appelant: any) =>
          s.prendreEnInstruction('rec-1', appelant),
      ],
      [
        'repondre',
        (s: ReclamationsService, appelant: any) =>
          s.repondre('rec-1', appelant, {
            reponse: 'Traité.',
            statut: StatutReclamation.RESOLUE,
          } as any),
      ],
    ])('%s refuse un rôle non habilité (403)', async (_nom, appeler) => {
      const { service, repo } = construire();

      await expect(
        appeler(service, { userId: 12, role: UserRole.PORTEUR }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Le refus tombe AVANT toute lecture : rien de la réclamation n'a fuité.
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('CONTRE-ÉPREUVE : un rôle habilité instruit et répond normalement', async () => {
      const { service } = construire();
      const appelant = { userId: 12, role: UserRole.SUPPORT };

      await expect(
        service.listerPourBackOffice(appelant),
      ).resolves.toHaveLength(1);

      const instruite = await service.prendreEnInstruction('rec-1', appelant);
      expect(instruite.statut).toBe(StatutReclamation.EN_INSTRUCTION);
      // L'agent qui agit est celui du jeton, jamais un identifiant fourni.
      expect(instruite.traiteParUserId).toBe(12);

      const close = await service.repondre('rec-1', appelant, {
        reponse: 'Le coupon a été versé le 3 juin.',
        statut: StatutReclamation.RESOLUE,
      } as any);
      expect(close.statut).toBe(StatutReclamation.RESOLUE);
      expect(close.traiteParUserId).toBe(12);
    });
  });
});
