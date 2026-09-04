import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { AdminSecondaryMarketController } from './admin-secondary-market.controller';

/**
 * GET /admin/secondary-market/orders renvoyait les ENTITÉS jointes telles
 * quelles : `vendeur` et `acheteur` étaient des `UserEntity` complètes. Le
 * carnet d'ordres publiait donc, pour chaque contrepartie, l'identifiant de
 * compte Stripe Connect, la note PEP interne, le motif de gel des avoirs, le
 * taux d'imposition marginal, le code de parrainage et le socialId.
 */
describe('AdminSecondaryMarketController.listOrders — projection', () => {
  const contrepartieComplete = (userId: number) => ({
    userId,
    firstname: 'Jean',
    lastname: `Vendeur${userId}`,
    role: UserRole.INVESTISSEUR,
    status: 'actif',
    password: 'hash',
    socialId: 'google-oauth2|42',
    stripeConnectAccountId: 'acct_secret',
    pepFlagged: true,
    pepNote: 'signalement interne',
    avoirsGelesMotif: 'gel judiciaire',
    tauxBaremeMarginal: 0.41,
    codeParrainage: 'BEOWN-ABCDEF',
    cguAcceptationIp: '203.0.113.7',
    createdAt: new Date('2026-01-01'),
    userEmail: { email: 'jean@example.com' },
  });

  const ordre = () => ({
    id: 'ord-1',
    investissementId: 'inv-1',
    vendeurId: 1,
    acheteurId: 2,
    sens: 'vente',
    nbFractions: 10,
    montant: '1000.00',
    prixUnitaire: '100.00',
    statut: OrdreMarcheStatus.EN_CARNET,
    interetNbFractions: null,
    interetExprimeLe: null,
    accepteLe: null,
    valideJusquAu: null,
    createdAt: new Date('2026-02-01'),
    vendeur: contrepartieComplete(1),
    acheteur: contrepartieComplete(2),
    investissement: {
      id: 'inv-1',
      projetId: 'proj-1',
      utilisateurId: 1,
      montant: '5000.00',
      nbTitres: 50,
      valeurTitre: '100.00',
      instrument: 'action',
      statut: 'confirme',
      createdAt: new Date('2026-01-05'),
      updatedAt: new Date('2026-01-06'),
      projet: {
        id: 'proj-1',
        slug: 'residence-alizes',
        titre: 'Résidence Les Alizés',
        type: 'residentiel',
        ville: 'Saint-Denis',
        region: 'La Réunion',
        pays: 'FR',
        statut: 'finance',
        instrument: 'action',
        capitalCible: '500000.00',
        adresseComplete: '12 rue interne, ne doit pas fuiter',
      },
    },
  });

  const makeController = (role = UserRole.SUPER_ADMIN, ordres: any[] = [ordre()]) => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndMapOne: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([ordres, ordres.length]),
    };
    const ordreRepo: any = { createQueryBuilder: jest.fn(() => qb) };
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue({ userId: 99, role }),
    };

    return new AdminSecondaryMarketController(
      ordreRepo,
      /* investRepo */ {} as any,
      userRepo,
      /* walletRepo */ {} as any,
      /* txRepo */ {} as any,
      /* projectRepo */ {} as any,
      /* dataSource */ {} as any,
      /* notificationService */ {} as any,
      /* notificationEvents */ {} as any,
      /* platformFees */ {} as any,
    );
  };

  const admin = { userId: 99 } as any;

  it('ne publie AUCUN champ sensible des contreparties', async () => {
    const controller = makeController();

    const res: any = await controller.listOrders(admin);

    for (const partie of [res.data[0].vendeur, res.data[0].acheteur]) {
      for (const champ of [
        'password',
        'socialId',
        'stripeConnectAccountId',
        'pepFlagged',
        'pepNote',
        'avoirsGelesMotif',
        'tauxBaremeMarginal',
        'codeParrainage',
        'cguAcceptationIp',
        'userEmail',
      ]) {
        expect(partie).not.toHaveProperty(champ);
      }
    }
  });

  it("conserve l'identité utile à la surveillance du marché", async () => {
    const controller = makeController();

    const res: any = await controller.listOrders(admin);

    expect(res.data[0].vendeur).toEqual({
      userId: 1,
      firstname: 'Jean',
      lastname: 'Vendeur1',
      role: UserRole.INVESTISSEUR,
      status: 'actif',
      createdAt: new Date('2026-01-01'),
    });
  });

  it("préserve le contrat consommé par le back-office (ordre, investissement, projet)", async () => {
    const controller = makeController();

    const res: any = await controller.listOrders(admin);
    const o = res.data[0];

    expect(o).toEqual(
      expect.objectContaining({
        id: 'ord-1',
        investissementId: 'inv-1',
        vendeurId: 1,
        acheteurId: 2,
        sens: 'vente',
        nbFractions: 10,
        montant: 1000,
        prixUnitaire: 100,
        statut: OrdreMarcheStatus.EN_CARNET,
      }),
    );
    expect(o.investissement).toEqual(
      expect.objectContaining({ id: 'inv-1', montant: 5000, nbTitres: 50 }),
    );
    expect(o.investissement.projet).toEqual(
      expect.objectContaining({ titre: 'Résidence Les Alizés', ville: 'Saint-Denis' }),
    );
    // Le projet lui-même est projeté : rien qui ne serve au carnet d'ordres.
    expect(o.investissement.projet).not.toHaveProperty('adresseComplete');
    expect(res.total).toBe(1);
  });

  it('un ordre sans acheteur reste servi avec acheteur null', async () => {
    const sansAcheteur = { ...ordre(), acheteur: undefined, acheteurId: null };
    const controller = makeController(UserRole.SUPER_ADMIN, [sansAcheteur]);

    const res: any = await controller.listOrders(admin);

    expect(res.data[0].acheteur).toBeNull();
    expect(res.data[0].acheteurId).toBeNull();
  });

  it('refuse un rôle sans market:manage, relu en base', async () => {
    const controller = makeController(UserRole.MARKETING);

    await expect(controller.listOrders(admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
