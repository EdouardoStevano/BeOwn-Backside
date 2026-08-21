import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import { ProjectEntity } from '../entities/project.entity';
import { ProjectOrmMapper } from './project.orm-mapper';

function ligne(): ProjectEntity {
  return Object.assign(new ProjectEntity(), {
    id: 'p1',
    slug: 'residence-horizon',
    titre: 'Résidence Horizon',
    type: ProjectType.RESIDENTIEL,
    spvId: null,
    porteurId: null,
    statut: ProjectStatus.EN_COLLECTE,
    ville: 'Lyon',
    region: 'ARA',
    pays: 'FR',
    adresseComplete: null,
    // Le pilote Postgres rend les `decimal` en chaînes.
    latitude: '45.7500000' as unknown as number,
    longitude: '4.8500000' as unknown as number,
    capitalCible: '500000.00' as unknown as number,
    capitalMinimum: '300000.00' as unknown as number,
    ticketMinimum: '100.00' as unknown as number,
    ticketMaximum: null,
    triCible: '8.50' as unknown as number,
    indiceRisque: 3,
    dureeMois: 24,
    instrument: ProjectInstrument.OBLIGATION,
    estPreInvestissable: false,
    plafondPreInvestissement: null,
    nbFractions: null,
    prixFraction: null,
    datePublication: new Date('2026-01-10T00:00:00Z'),
    dateOuvertureCollecte: new Date('2026-02-01T00:00:00Z'),
    dateCloturePrevue: null,
    descriptionMd: null,
    avertissementMd: null,
    youtubeUrl: null,
    previsionnel: null,
    chronologie: [],
    garanties: [],
    echeancierEmprunteur: [],
    modeleEconomique: ModeleEconomique.OBLIGATAIRE,
    nbUnitesLouables: null,
    motifAnnulation: null,
    annuleLe: null,
    broadcastAnnonceAt: new Date('2026-01-10T09:00:00Z'),
    broadcastCollecteAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-10T00:00:00Z'),
  });
}

describe('ProjectOrmMapper', () => {
  describe('toDomain', () => {
    it('convertit les decimal rendus en chaînes par le pilote Postgres', () => {
      const projet = ProjectOrmMapper.toDomain(ligne());

      expect(projet.capitalCible).toBe(500_000);
      expect(projet.ticketMinimum).toBe(100);
      expect(projet.triCible).toBe(8.5);
      expect(projet.latitude).toBe(45.75);
    });

    it('relit une ligne sans rejouer les invariants du domaine', () => {
      const incoherente = Object.assign(ligne(), {
        capitalMinimum: '999999.00' as unknown as number,
        longitude: null,
      });

      expect(() => ProjectOrmMapper.toDomain(incoherente)).not.toThrow();
    });

    it('retombe sur OBLIGATAIRE pour les lignes antérieures à l’extension equity', () => {
      const ancienne = Object.assign(ligne(), {
        modeleEconomique: null as unknown as ModeleEconomique,
      });

      expect(ProjectOrmMapper.toDomain(ancienne).modeleEconomique).toBe(
        ModeleEconomique.OBLIGATAIRE,
      );
    });
  });

  describe('toEntity', () => {
    it('fait un aller-retour sans perte', () => {
      const entity = ProjectOrmMapper.toEntity(
        ProjectOrmMapper.toDomain(ligne()),
      );

      expect(entity.id).toBe('p1');
      expect(entity.slug).toBe('residence-horizon');
      expect(entity.statut).toBe(ProjectStatus.EN_COLLECTE);
      expect(entity.capitalCible).toBe(500_000);
      expect(entity.datePublication).toEqual(new Date('2026-01-10T00:00:00Z'));
    });

    it('n’écrit jamais les horodatages de diffusion — ils appartiennent à BroadcastService', () => {
      const entity = ProjectOrmMapper.toEntity(
        ProjectOrmMapper.toDomain(ligne()),
      );

      // `undefined` : TypeORM ignore la colonne, le claim atomique tient.
      expect(entity.broadcastAnnonceAt).toBeUndefined();
      expect(entity.broadcastCollecteAt).toBeUndefined();
    });

    it('n’écrit pas les colonnes que l’agrégat ne porte pas', () => {
      const entity = ProjectOrmMapper.toEntity(
        ProjectOrmMapper.toDomain(ligne()),
      );

      expect(entity.echeancierEmprunteur).toBeUndefined();
      expect(entity.motifAnnulation).toBeUndefined();
      expect(entity.annuleLe).toBeUndefined();
    });

    it('publie les horodatages de diffusion en lecture, eux', () => {
      const projet = ProjectOrmMapper.toDomain(ligne());

      expect(projet.toJSON().broadcastAnnonceAt).toEqual(
        new Date('2026-01-10T09:00:00Z'),
      );
    });
  });
});
