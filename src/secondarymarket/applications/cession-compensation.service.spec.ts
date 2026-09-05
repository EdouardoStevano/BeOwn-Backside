import { BadRequestException } from '@nestjs/common';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { CessionCompensationService } from './cession-compensation.service';

/**
 * La réservation est LA garde de solvabilité du marché secondaire — la seule,
 * depuis le retrait du contrôle redondant d'`InitiateBuyUseCase` (B1). Ce qui
 * suit fige sa condition : `solde >= montant`, jamais davantage.
 */
describe('CessionCompensationService — réservation des fonds', () => {
  /**
   * Portefeuille en mémoire appliquant réellement la clause `WHERE` : une
   * condition non satisfaite laisse la position intacte et rend `affected: 0`,
   * comme en base. C'est indispensable pour que « atomique et conditionnel »
   * soit testé pour ce qu'il est.
   */
  const construireDepotWallets = (position: {
    disponible: number;
    bloque: number;
  }) => ({
    createQueryBuilder: jest.fn(() => {
      let sens: 'reservation' | 'liberation' | null = null;
      let montant = 0;
      const qb: any = {
        update: jest.fn(() => qb),
        set: jest.fn((valeurs: Record<string, unknown>) => {
          const expr = String(valeurs.solde);
          sens = expr.includes('-') ? 'reservation' : 'liberation';
          return qb;
        }),
        setParameter: jest.fn((_nom: string, valeur: number) => {
          montant = valeur;
          return qb;
        }),
        where: jest.fn((clause: string, params: any) => {
          qb._clause = clause;
          qb._params = params;
          return qb;
        }),
        execute: jest.fn(async () => {
          if (qb._params?.type !== WalletType.INVESTISSEUR) return { affected: 0 };
          if (sens === 'reservation') {
            if (position.disponible < montant) return { affected: 0 };
            position.disponible -= montant;
            position.bloque += montant;
            return { affected: 1 };
          }
          if (position.bloque < montant) return { affected: 0 };
          position.bloque -= montant;
          position.disponible += montant;
          return { affected: 1 };
        }),
      };
      return qb;
    }),
  });

  const construire = (disponible: number, bloque = 0) => {
    const position = { disponible, bloque };
    // `reserverFonds` passe par le dépôt injecté, `libererFonds` par le
    // manager de la source de données : les deux pointent ici la MÊME position,
    // sans quoi les deux moitiés du service ne se compenseraient pas.
    const depot = construireDepotWallets(position);
    return {
      service: new CessionCompensationService(
        /* ordreRepo */ {} as any,
        depot as any,
        /* dataSource */ { manager: depot } as any,
      ),
      position,
    };
  };

  describe('montantCession', () => {
    it('arrondit au centime', () => {
      expect(CessionCompensationService.montantCession('33.333', 3)).toBe(100);
      expect(CessionCompensationService.montantCession(100, 3)).toBe(300);
    });
  });

  describe('reserverFonds — la condition est « solde >= montant »', () => {
    it('accepte un solde ÉGAL au montant (B1)', async () => {
      const { service, position } = construire(300);

      await expect(service.reserverFonds(42, 300)).resolves.toBeUndefined();

      expect(position).toEqual({ disponible: 0, bloque: 300 });
    });

    it("n'exige PAS le double du montant", async () => {
      // La régression corrigée revenait à exiger `solde >= 2 × montant`.
      const { service, position } = construire(300.01);

      await service.reserverFonds(42, 300);

      expect(position.bloque).toBe(300);
    });

    it('refuse un solde inférieur d’un centime, sans rien déplacer', async () => {
      const { service, position } = construire(299.99);

      await expect(service.reserverFonds(42, 300)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(position).toEqual({ disponible: 299.99, bloque: 0 });
    });

    it('ne touche rien pour un montant nul ou négatif', async () => {
      const { service, position } = construire(300);

      await service.reserverFonds(42, 0);
      await service.reserverFonds(42, -10);

      expect(position).toEqual({ disponible: 300, bloque: 0 });
    });

    it("déplace la disponibilité SANS changer les fonds détenus (invariant)", async () => {
      const { service, position } = construire(1000);

      await service.reserverFonds(42, 300);

      // Réservation = transfert interne au portefeuille : le total détenu est
      // inchangé, seule sa disponibilité change.
      expect(position.disponible + position.bloque).toBe(1000);
    });
  });

  describe('libererFonds — idempotente par la condition sur soldeBloque', () => {
    it('rend les fonds bloqués', async () => {
      const { service, position } = construire(0, 300);

      await expect(service.libererFonds(42, 300)).resolves.toBe(300);

      expect(position).toEqual({ disponible: 300, bloque: 0 });
    });

    it('un second appel ne recrédite pas une seconde fois', async () => {
      const { service, position } = construire(0, 300);

      await service.libererFonds(42, 300);
      await expect(service.libererFonds(42, 300)).resolves.toBe(0);

      expect(position).toEqual({ disponible: 300, bloque: 0 });
    });
  });
});
