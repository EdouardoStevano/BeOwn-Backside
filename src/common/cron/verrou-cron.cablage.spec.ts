import { ReconciliationCronService } from 'src/wallets/applications/reconciliation-cron.service';
import { RgpdPurgeCronService } from 'src/rgpd/applications/rgpd-purge-cron.service';

/**
 * H (câblage) — LE VERROU DOIT ÊTRE RÉELLEMENT CONSULTÉ.
 *
 * Un `VerrouCronService` fourni par le module mais jamais appelé par la tâche
 * ne protège rien, et rien ne le signalerait : le travail continuerait de se
 * faire six fois sans qu'aucun test n'échoue. Ces assertions portent donc sur
 * le CHEMIN — le balayage ne s'exécute que si le verrou a été obtenu.
 */
describe('câblage du verrou distribué aux tâches planifiées', () => {
  const verrouQuiRefuse = () => ({
    executerSiSeul: jest.fn().mockResolvedValue(null),
  });
  const verrouQuiAccorde = () => ({
    executerSiSeul: jest.fn(async (_nom: string, traitement: any) => traitement()),
  });

  describe('réconciliation du grand livre', () => {
    const construire = (verrou?: any) => {
      const reconciliation = {
        reconcilier: jest.fn().mockResolvedValue({
          nbWallets: 0,
          nbEcritures: 0,
          ecarts: [],
          equilibre: true,
        }),
      };
      return {
        service: new ReconciliationCronService(reconciliation as any, verrou),
        reconciliation,
      };
    };

    it("n'exécute PAS le contrôle quand le verrou est tenu ailleurs", async () => {
      const verrou = verrouQuiRefuse();
      const h = construire(verrou);

      await h.service.reconcilierQuotidiennement();

      expect(verrou.executerSiSeul).toHaveBeenCalledWith(
        'wallets:reconciliation',
        expect.any(Function),
      );
      expect(h.reconciliation.reconcilier).not.toHaveBeenCalled();
    });

    it('exécute le contrôle quand le verrou est obtenu', async () => {
      const h = construire(verrouQuiAccorde());

      await h.service.reconcilierQuotidiennement();

      expect(h.reconciliation.reconcilier).toHaveBeenCalledTimes(1);
    });

    it('sans verrou injecté, le comportement antérieur est conservé', async () => {
      const h = construire(undefined);

      await h.service.reconcilierQuotidiennement();

      expect(h.reconciliation.reconcilier).toHaveBeenCalledTimes(1);
    });
  });

  describe('purge RGPD', () => {
    const construire = (verrou?: any) => {
      // Forme minimale attendue par le journal du cron.
      const purge = {
        purger: jest.fn().mockResolvedValue({ totalTraites: 0, compteurs: [] }),
      };
      return {
        service: new RgpdPurgeCronService(purge as any, verrou),
        purge,
      };
    };

    it("ne purge PAS quand le verrou est tenu ailleurs", async () => {
      const verrou = verrouQuiRefuse();
      const h = construire(verrou);

      await h.service.purgerQuotidiennement();

      expect(verrou.executerSiSeul).toHaveBeenCalledWith(
        'rgpd:purge',
        expect.any(Function),
      );
      expect(h.purge.purger).not.toHaveBeenCalled();
    });

    it('purge quand le verrou est obtenu', async () => {
      const h = construire(verrouQuiAccorde());

      await h.service.purgerQuotidiennement();

      expect(h.purge.purger).toHaveBeenCalledTimes(1);
    });
  });
});
