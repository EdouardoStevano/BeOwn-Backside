import { NotificationService } from './notification.service';

/**
 * `markAsRead` était la seule opération unitaire du module à ne PAS être
 * contrainte par ressource : `update(id, …)` acceptait n'importe quel
 * identifiant, si bien qu'un porteur de jeton pouvait marquer lue la
 * notification d'un autre utilisateur (IDOR en écriture). Elle omettait aussi
 * la réémission du compteur de non-lus que font `markAllAsRead` et `deleteOne`.
 */
describe('NotificationService.markAsRead', () => {
  const build = (affected: number) => {
    const notificationRepo = {
      update: jest.fn().mockResolvedValue({ affected }),
      count: jest.fn().mockResolvedValue(3),
    };
    const gateway = { sendUnreadCount: jest.fn(), sendToUser: jest.fn() };
    const service = new NotificationService(
      notificationRepo as any,
      {} as any,
      gateway as any,
    );
    return { service, notificationRepo, gateway };
  };

  it("contraint la mise à jour à l'utilisateur appelant, comme deleteOne", async () => {
    const { service, notificationRepo } = build(1);

    await service.markAsRead('notif-1', 42);

    expect(notificationRepo.update).toHaveBeenCalledWith(
      { id: 'notif-1', utilisateurId: 42 },
      { lu: true, statut: 'lu' },
    );
  });

  it("réémet le compteur de non-lus du destinataire", async () => {
    const { service, gateway, notificationRepo } = build(1);

    await expect(service.markAsRead('notif-1', 42)).resolves.toEqual({
      updated: true,
    });

    expect(notificationRepo.count).toHaveBeenCalledWith({
      where: { utilisateurId: 42, lu: false },
    });
    expect(gateway.sendUnreadCount).toHaveBeenCalledWith(42, 3);
  });

  it("la notification d'un autre utilisateur n'est pas atteignable : aucune ligne touchée, aucun compteur émis", async () => {
    const { service, gateway } = build(0);

    await expect(service.markAsRead('notif-victime', 42)).resolves.toEqual({
      updated: false,
    });

    expect(gateway.sendUnreadCount).not.toHaveBeenCalled();
  });
});
