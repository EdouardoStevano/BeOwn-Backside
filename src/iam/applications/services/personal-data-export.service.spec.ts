import { In } from 'typeorm';
import { PersonalDataExportService } from './personal-data-export.service';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { DistributionPartEntity } from 'src/distributions/infrastructure/persistences/entities/distribution-part.entity';
import { ReclamationEntity } from 'src/reclamations/infrastructure/persistences/entities/reclamation.entity';

const USER_ID = 7;

/**
 * L'export art. 15/20 est LA cible IDOR par excellence : un seul filtre oublié
 * et l'endpoint restitue les données d'un tiers. Ces tests vérifient sur des
 * dépôts factices que chaque lecture est bornée à l'utilisateur courant et que
 * les identifiants de tiers (contrepartie d'un ordre, agent d'une
 * réclamation, évaluations LCB-FT internes) ne traversent jamais la
 * projection.
 */
describe('PersonalDataExportService', () => {
  const buildService = () => {
    const walletRows = [
      { id: 'w-1', type: 'principal', devise: 'EUR', solde: '100.00' },
    ];
    const investmentRows = [{ id: 'inv-1', projetId: 'p-1', statut: 'confirme' }];
    const userRow = {
      userId: USER_ID,
      firstname: 'Jeanne',
      lastname: 'Payet',
      userEmail: { email: 'jeanne@example.com', isVerified: true },
      cguAccepteesLe: new Date('2026-09-03T10:00:00Z'),
      cguVersionAcceptee: '1.0',
      cguAcceptationIp: '127.0.0.1',
      // Évaluations internes LCB-FT : ne doivent JAMAIS sortir.
      pepFlagged: true,
      pepNote: 'note interne',
      codeParrainage: 'BEOWN-ABC234',
      parrainePar: 9,
    };
    const ordreRows = [
      {
        id: 'ord-1',
        vendeurId: USER_ID,
        acheteurId: 42,
        sens: 'vente',
        nbFractions: 10,
        statut: 'execute',
      },
    ];
    const reclamationRows = [
      { id: 'rec-1', reference: 'REC-1', traiteParUserId: 99, statut: 'traitee' },
    ];

    const findCalls: { entity: unknown; where: unknown }[] = [];
    const repoFor = (rows: unknown[], entity: unknown) => ({
      findOne: jest.fn((opts: { where: unknown }) => {
        findCalls.push({ entity, where: opts.where });
        return Promise.resolve(rows[0] ?? null);
      }),
      find: jest.fn((opts: { where: unknown }) => {
        findCalls.push({ entity, where: opts.where });
        return Promise.resolve(rows);
      }),
    });

    const reposByEntity = new Map<unknown, ReturnType<typeof repoFor>>([
      [UserEntity, repoFor([userRow], UserEntity)],
      [WalletEntity, repoFor(walletRows, WalletEntity)],
      [TransactionEntity, repoFor([], TransactionEntity)],
      [InvestmentEntity, repoFor(investmentRows, InvestmentEntity)],
      [OrdreMarcheEntity, repoFor(ordreRows, OrdreMarcheEntity)],
      [DistributionPartEntity, repoFor([], DistributionPartEntity)],
      [ReclamationEntity, repoFor(reclamationRows, ReclamationEntity)],
    ]);

    const dataSource = {
      getRepository: jest.fn(
        (entity: unknown) => reposByEntity.get(entity) ?? repoFor([], entity),
      ),
    };

    return {
      service: new PersonalDataExportService(dataSource as never),
      findCalls,
    };
  };

  it('borne chaque lecture au userId du JWT ou à des identifiants qui en dérivent', async () => {
    const { service, findCalls } = buildService();

    await service.export(USER_ID);

    const derives = new Set(['w-1', 'inv-1']);
    for (const { entity, where } of findCalls) {
      const clauses = Array.isArray(where) ? where : [where];
      for (const clause of clauses as Record<string, unknown>[]) {
        const parUserId = [
          'userId',
          'utilisateurId',
          'proprietaireUserId',
          'vendeurId',
          'acheteurId',
          'parrainId',
          'filleulId',
        ].some((champ) => clause[champ] === USER_ID);
        // Transactions et distributions : filtrées par In(...) sur des ids
        // chargés depuis les lignes de l'utilisateur — dérivation vérifiée.
        const parDerivation = Object.values(clause).some(
          (v) =>
            v instanceof Object &&
            v.constructor === (In(['x']) as object).constructor &&
            (v as { value: string[] }).value.every((id) => derives.has(id)),
        );
        expect({
          entity: (entity as { name?: string })?.name,
          ok: parUserId || parDerivation,
        }).toEqual({ entity: (entity as { name?: string })?.name, ok: true });
      }
    }
  });

  it('masque les tiers et les évaluations internes dans la projection', async () => {
    const { service } = buildService();

    const exporte = await service.export(USER_ID);

    // Contrepartie d'un ordre : rôle restitué, identifiant du tiers absent.
    expect(exporte.marcheSecondaire[0].role).toBe('vendeur');
    expect(JSON.stringify(exporte.marcheSecondaire)).not.toContain('42');
    // Agent traitant la réclamation : jamais exporté.
    expect(JSON.stringify(exporte.reclamations)).not.toContain('traiteParUserId');
    // Évaluations LCB-FT internes : interdiction de divulgation.
    const identite = JSON.stringify(exporte.identite);
    expect(identite).not.toContain('pep');
    expect(identite).not.toContain('note interne');
    // Le consentement CGU, lui, appartient à l'utilisateur.
    expect(
      (exporte.identite as { consentements: { cguVersionAcceptee: string } })
        .consentements.cguVersionAcceptee,
    ).toBe('1.0');
  });

  it('parrainage : montants et statuts restitués, identifiants des tiers masqués', async () => {
    const { service } = buildService();

    const exporte = await service.export(USER_ID);

    expect(exporte.parrainage.monCodeParrainage).toBe('BEOWN-ABC234');
    expect(exporte.parrainage.inscritViaParrainage).toBe(true);
    const json = JSON.stringify(exporte.parrainage);
    expect(json).not.toContain('parrainId');
    expect(json).not.toContain('filleulId');
    expect(json).not.toContain('parrainePar');
  });
});
