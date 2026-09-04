import { ForbiddenException } from '@nestjs/common';
import { PorteurController } from './porteur.controller';

/**
 * `POST /porteur/baux` ne vérifiait que l'appartenance de l'UNITÉ. Un porteur
 * pouvait donc créer un bail sur son propre bien en le rattachant à la SCI
 * d'un AUTRE porteur : le loyer et le locataire nominatif entraient dans la
 * comptabilité d'un tiers. La garde `assertOwnsSpv` existait déjà dans ce
 * contrôleur — elle n'était pas appelée ici.
 */
describe('PorteurController.createBailEndpoint — cloisonnement SCI', () => {
  const PROJET_DU_PORTEUR = { id: 'p-1', porteurId: 7, spvId: 'spv-mien' };

  const makeController = () => {
    const uniteRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'u-1', projetId: 'p-1' }),
    };
    const projectRepo = {
      findAllProjects: jest.fn().mockResolvedValue({ data: [PROJET_DU_PORTEUR] }),
      findProjectById: jest.fn().mockResolvedValue(PROJET_DU_PORTEUR),
    };
    const createBail = { execute: jest.fn().mockResolvedValue({ id: 'b-1' }) };

    // Le contrôleur est instancié positionnellement : seules les dépendances
    // exercées par ce parcours sont réelles.
    const controller = new PorteurController(
      /* addUniteLouable */ {} as any,
      createBail as any,
      /* updateBail */ {} as any,
      /* resilierBail */ {} as any,
      /* declareLoyer */ {} as any,
      /* declareCharge */ {} as any,
      /* getOccupation */ {} as any,
      /* getEtatFinancier */ {} as any,
      uniteRepo as any,
      /* bailRepo */ {} as any,
      /* locataireRepo */ {} as any,
      projectRepo as any,
      /* cloudStorage */ {} as any,
    );
    return { controller, createBail };
  };

  const porteur = { userId: 7, email: 'p@b.c', role: 'porteur' } as any;
  const bail = (spvId: string) =>
    ({
      uniteLouableId: 'u-1',
      locataire: { nom: 'Martin', prenom: 'Léa' },
      loyerMensuel: 800,
      dateDebut: '2026-09-01',
      spvId,
    }) as any;

  it("REFUSE un bail rattaché à la SCI d'un autre porteur", async () => {
    const { controller, createBail } = makeController();

    await expect(
      controller.createBailEndpoint(bail('spv-autre-porteur'), porteur),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createBail.execute).not.toHaveBeenCalled();
  });

  it('accepte un bail rattaché à une SCI du porteur', async () => {
    const { controller, createBail } = makeController();

    await expect(
      controller.createBailEndpoint(bail('spv-mien'), porteur),
    ).resolves.toEqual({ id: 'b-1' });
    expect(createBail.execute).toHaveBeenCalledTimes(1);
  });
});
