import { ProjectMapper } from './project.mapper';
import { ProjectEntity } from '../entities/project.entity';
import { ProjectTypeOrmRepository } from '../repositories/project.repository';

/**
 * Dénomination de la société support (SCI/SPV) exposée sur le projet.
 *
 * `GET /projects/:id` ne renvoyait que `spvId` : le contrat de souscription ne
 * pouvait pas imprimer l'émetteur. Le champ `societeSupportNom` est ADDITIF —
 * il projette `spv.raisonSociale` sans modifier le reste du contrat.
 */
describe('ProjectMapper — projection de la société support', () => {
  const baseEntity = (over: Partial<ProjectEntity> = {}): ProjectEntity =>
    ({
      id: 'p1',
      slug: 'projet-1',
      titre: 'Bureaux Plateau',
      spvId: null,
      porteurId: null,
      capitalCible: 100000,
      capitalMinimum: 50000,
      ticketMinimum: 500,
      dureeMois: 24,
      ...over,
    }) as any;

  it('expose la raison sociale quand la relation spv est chargée', () => {
    const domain = ProjectMapper.toDomain(
      baseEntity({
        spvId: 'spv-1',
        spv: { id: 'spv-1', raisonSociale: 'SCI Bureaux Plateau' } as any,
      }),
    );

    expect(domain.societeSupportNom).toBe('SCI Bureaux Plateau');
    // Le champ existant reste inchangé : ajout strictement additif.
    expect(domain.spvId).toBe('spv-1');
  });

  it('null quand le projet n\'a pas de société support', () => {
    const domain = ProjectMapper.toDomain(baseEntity({ spvId: null }));

    expect(domain.societeSupportNom).toBeNull();
    expect(domain.spvId).toBeNull();
  });

  it('null — et aucune requête — quand la relation n\'a pas été jointe', () => {
    // Cas d'un chemin de lecture qui ne joint pas `spv` : le mapper doit se
    // contenter de `null`. Déclencher un chargement paresseux ici produirait
    // un N+1 sur les listes de projets.
    const domain = ProjectMapper.toDomain(
      baseEntity({ spvId: 'spv-1', spv: undefined as any }),
    );

    expect(domain.societeSupportNom).toBeNull();
    // L'identifiant reste disponible pour un chargement explicite si besoin.
    expect(domain.spvId).toBe('spv-1');
  });

  it('ne fuite aucune donnée bancaire de la société support', () => {
    const domain: any = ProjectMapper.toDomain(
      baseEntity({
        spvId: 'spv-1',
        spv: {
          id: 'spv-1',
          raisonSociale: 'SCI Bureaux Plateau',
          iban: 'FR7630001007941234567890185',
        } as any,
      }),
    );

    expect(JSON.stringify(domain)).not.toMatch(/FR7630001007941234567890185/);
    expect(domain.iban).toBeUndefined();
  });
});

describe('ProjectRepository — chargement de la relation spv', () => {
  /**
   * Vérifie le CHOIX DE REQUÊTE, invisible autrement : sans jointure, la
   * dénomination remonterait `null` en production alors que le mapper est
   * correct — ou pire, provoquerait une requête par projet.
   */
  it('findProjectById joint la société support', async () => {
    const projectRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const repo = new ProjectTypeOrmRepository(projectRepo, {} as any);

    await repo.findProjectById('p1');

    expect(projectRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ relations: { spv: true } }),
    );
  });

  it('findAllProjects joint la société support UNE fois pour toute la page', async () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const projectRepo: any = { createQueryBuilder: jest.fn(() => qb) };
    const repo = new ProjectTypeOrmRepository(projectRepo, {} as any);

    await repo.findAllProjects({ page: 1, limit: 20 });

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('p.spv', 'spv');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledTimes(1);
  });
});
