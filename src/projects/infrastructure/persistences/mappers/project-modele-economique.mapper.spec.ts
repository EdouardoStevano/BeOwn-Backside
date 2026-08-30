import { ProjectMapper } from './project.mapper';
import { ProjectEntity } from '../entities/project.entity';
import { Project } from 'src/projects/domains/project';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';

/**
 * Asymétrie voulue du mapper sur `modeleEconomique`.
 *
 * Le défaut d'origine : les DEUX sens portaient `?? ModeleEconomique.OBLIGATAIRE`.
 * Le repli d'ÉCRITURE réécrivait silencieusement la colonne dès qu'un domaine
 * ne portait pas le champ — le commutateur était donc inécrivable en pratique,
 * et tout projet retombait obligataire.
 *
 * Règle retenue :
 * - LECTURE  : repli conservé (les lignes antérieures à la colonne peuvent être
 *              NULL ; « modèle inconnu » = comportement historique obligataire) ;
 * - ÉCRITURE : aucun repli. On n'affecte la colonne que si le domaine porte une
 *              valeur, sinon on laisse le DEFAULT de colonne jouer à l'INSERT et
 *              la valeur en base intacte à l'UPDATE.
 */
describe('ProjectMapper — modeleEconomique', () => {
  const entiteBase = (): ProjectEntity =>
    Object.assign(new ProjectEntity(), {
      id: 'proj-1',
      slug: 'residence-les-jardins',
      titre: 'Résidence Les Jardins',
      spvId: null,
      porteurId: null,
      type: ProjectType.RESIDENTIEL,
      ville: null,
      region: null,
      pays: 'FR',
      capitalCible: '600000.00',
      capitalMinimum: '360000.00',
      ticketMinimum: '100.00',
      dureeMois: 36,
      instrument: ProjectInstrument.PART_SOCIALE,
      statut: ProjectStatus.BROUILLON,
      estPreInvestissable: false,
      nbFractions: 6_000,
    });

  const domaineBase = (): Project =>
    Object.assign(new Project(), {
      slug: 'residence-les-jardins',
      titre: 'Résidence Les Jardins',
      spvId: null,
      porteurId: null,
      type: ProjectType.RESIDENTIEL,
      pays: 'FR',
      capitalCible: 600_000,
      capitalMinimum: 360_000,
      ticketMinimum: 100,
      dureeMois: 36,
      instrument: ProjectInstrument.PART_SOCIALE,
      statut: ProjectStatus.BROUILLON,
      estPreInvestissable: false,
      nbFractions: 6_000,
    });

  describe('lecture (toDomain)', () => {
    it('lit `equity` tel quel', () => {
      const entity = entiteBase();
      entity.modeleEconomique = ModeleEconomique.EQUITY;
      expect(ProjectMapper.toDomain(entity).modeleEconomique).toBe(
        ModeleEconomique.EQUITY,
      );
    });

    it('lit `obligataire` tel quel', () => {
      const entity = entiteBase();
      entity.modeleEconomique = ModeleEconomique.OBLIGATAIRE;
      expect(ProjectMapper.toDomain(entity).modeleEconomique).toBe(
        ModeleEconomique.OBLIGATAIRE,
      );
    });

    it('replie sur `obligataire` une ligne héritée sans modèle (rétrocompatibilité)', () => {
      const entity = entiteBase();
      (entity as any).modeleEconomique = null;
      expect(ProjectMapper.toDomain(entity).modeleEconomique).toBe(
        ModeleEconomique.OBLIGATAIRE,
      );
    });
  });

  describe('écriture (toEntity)', () => {
    it("n'écrase JAMAIS une valeur explicite `equity`", () => {
      const domain = domaineBase();
      domain.modeleEconomique = ModeleEconomique.EQUITY;
      expect(ProjectMapper.toEntity(domain).modeleEconomique).toBe(
        ModeleEconomique.EQUITY,
      );
    });

    it('écrit `obligataire` quand le domaine le porte explicitement', () => {
      const domain = domaineBase();
      domain.modeleEconomique = ModeleEconomique.OBLIGATAIRE;
      expect(ProjectMapper.toEntity(domain).modeleEconomique).toBe(
        ModeleEconomique.OBLIGATAIRE,
      );
    });

    it("laisse la colonne INTACTE quand le domaine ne porte pas le champ (plus de repli d'écriture : un save partiel ne repasse pas un projet equity en obligataire)", () => {
      const domain = domaineBase(); // `modeleEconomique` absent
      expect(ProjectMapper.toEntity(domain).modeleEconomique).toBeUndefined();
    });
  });

  it('conserve la valeur sur un aller-retour domaine → entité → domaine', () => {
    const domain = domaineBase();
    domain.modeleEconomique = ModeleEconomique.EQUITY;

    const aller = ProjectMapper.toEntity(domain);
    const retour = ProjectMapper.toDomain(
      Object.assign(entiteBase(), { modeleEconomique: aller.modeleEconomique }),
    );

    expect(retour.modeleEconomique).toBe(ModeleEconomique.EQUITY);
  });
});
