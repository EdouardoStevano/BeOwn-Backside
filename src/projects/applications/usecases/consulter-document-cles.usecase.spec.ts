import { NotFoundException } from '@nestjs/common';
import { ConsulterDocumentClesUseCase } from './consulter-document-cles.usecase';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { SECTIONS_REQUISES, SectionFici } from 'src/projects/domains/fici';

const PROJET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const contenuComplet = {
  sections: Object.fromEntries(
    SECTIONS_REQUISES.map((section) => [section, 'Contenu du porteur.']),
  ) as Record<SectionFici, string>,
  nombrePages: 4,
  langue: 'fr',
  version: 3,
  dateVersion: '2026-08-29T10:00:00.000Z',
};

function makeDeps(projet: any) {
  const projectRepository = {
    findProjectById: jest.fn().mockResolvedValue(projet),
    findProjectBySlug: jest.fn().mockResolvedValue(projet),
  };
  return {
    projectRepository,
    usecase: new ConsulterDocumentClesUseCase(projectRepository as any),
  };
}

const projet = (statut: ProjectStatus, fici: unknown) => ({
  id: PROJET_ID,
  slug: 'residence-les-jardins',
  titre: 'Résidence Les Jardins',
  statut,
  fici,
});

describe('ConsulterDocumentClesUseCase — route publique', () => {
  it("sert le document d'une opération publiée", async () => {
    const { usecase } = makeDeps(
      projet(ProjectStatus.EN_COLLECTE, contenuComplet),
    );

    const vue = await usecase.pourPublic('residence-les-jardins');

    expect(vue.verdict.valide).toBe(true);
    expect(vue.version).toBe(3);
    expect(vue.sections).toHaveLength(8);
    expect(vue.sections[0].intitule).toBe("1 — Qui porte l'opération");
    expect(vue.avertissements.liminaire).toContain(
      "Il n'a été vérifié ni approuvé par aucune autorité publique.",
    );
  });

  it('ANTI-FUITE : un brouillon renvoie 404 même quand son document existe', async () => {
    const { usecase } = makeDeps(
      projet(ProjectStatus.BROUILLON, contenuComplet),
    );

    await expect(
      usecase.pourPublic('residence-les-jardins'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 quand le slug est inconnu', async () => {
    const { usecase, projectRepository } = makeDeps(null);
    projectRepository.findProjectBySlug.mockResolvedValue(null);

    await expect(usecase.pourPublic('inconnu')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404 quand aucun document n'est enregistré", async () => {
    const { usecase } = makeDeps(projet(ProjectStatus.ANNONCE, null));

    await expect(usecase.pourPublic('residence-les-jardins')).rejects.toThrow(
      /document d'informations clés/,
    );
  });
});

describe('ConsulterDocumentClesUseCase — route Admin', () => {
  it('sert un projet sans document, avec les huit sections vides et le verdict', async () => {
    const { usecase } = makeDeps(projet(ProjectStatus.BROUILLON, null));

    const vue = await usecase.pourAdmin(PROJET_ID);

    expect(vue.version).toBeNull();
    expect(vue.sections).toHaveLength(8);
    expect(vue.sections.every((s) => s.contenu === null)).toBe(true);
    expect(vue.verdict.valide).toBe(false);
    expect(vue.verdict.intitulesManquants).toHaveLength(8);
    expect(vue.nombreMaxPages).toBe(6);
  });

  it('sert un brouillon incomplet en désignant les sections restantes', async () => {
    const partiel = {
      sections: {
        [SectionFici.PORTEUR_ET_OPERATION]: 'SCI Horizon…',
        [SectionFici.FRAIS]: '7 % des loyers encaissés.',
      },
    };
    const { usecase } = makeDeps(projet(ProjectStatus.BROUILLON, partiel));

    const vue = await usecase.pourAdmin(PROJET_ID);

    expect(vue.verdict.valide).toBe(false);
    expect(vue.verdict.sectionsManquantes).toHaveLength(6);
    expect(vue.verdict.intitulesManquants).toContain(
      '3 — La société support et vos parts',
    );
    expect(vue.sections.find((s) => s.cle === SectionFici.FRAIS)?.contenu).toBe(
      '7 % des loyers encaissés.',
    );
  });

  it("sert l'aide à la saisie de chaque section", async () => {
    const { usecase } = makeDeps(projet(ProjectStatus.BROUILLON, null));

    const vue = await usecase.pourAdmin(PROJET_ID);

    expect(vue.sections.every((s) => s.aide.length > 0)).toBe(true);
  });

  it('404 si le projet est introuvable', async () => {
    const { usecase, projectRepository } = makeDeps(null);
    projectRepository.findProjectById.mockResolvedValue(null);

    await expect(usecase.pourAdmin(PROJET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
