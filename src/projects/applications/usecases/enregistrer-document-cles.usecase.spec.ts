import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EnregistrerDocumentClesUseCase } from './enregistrer-document-cles.usecase';
import { SECTIONS_REQUISES, SectionFici } from 'src/projects/domains/fici';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

const PROJET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const sectionsCompletes = () =>
  Object.fromEntries(
    SECTIONS_REQUISES.map((section) => [
      section,
      `Contenu rédigé par le porteur pour ${section}.`,
    ]),
  ) as Record<SectionFici, string>;

function makeDeps(ficiCourante: unknown = null) {
  const projectRepository = {
    findProjectById: jest.fn().mockResolvedValue({
      id: PROJET_ID,
      slug: 'residence-les-jardins',
      titre: 'Résidence Les Jardins',
      statut: ProjectStatus.ANNONCE,
      fici: ficiCourante,
    }),
    updateProject: jest.fn().mockImplementation((p) => Promise.resolve(p)),
  };
  return {
    projectRepository,
    usecase: new EnregistrerDocumentClesUseCase(projectRepository as any),
  };
}

describe('EnregistrerDocumentClesUseCase', () => {
  it('enregistre un document complet et le renvoie', async () => {
    const { usecase, projectRepository } = makeDeps();

    const { contenu, verdict } = await usecase.execute({
      projetId: PROJET_ID,
      sections: sectionsCompletes(),
      nombrePages: 5,
      langue: 'fr',
    });

    expect(verdict.valide).toBe(true);
    expect(Object.keys(contenu.sections)).toHaveLength(8);
    expect(projectRepository.updateProject).toHaveBeenCalledTimes(1);
    const sauvegarde = projectRepository.updateProject.mock.calls[0][0];
    expect(sauvegarde.fici.sections[SectionFici.FRAIS]).toContain('porteur');
  });

  it('pose le numéro et la date de version côté serveur', async () => {
    const { usecase } = makeDeps();

    const { contenu } = await usecase.execute({
      projetId: PROJET_ID,
      sections: sectionsCompletes(),
    });

    expect(contenu.version).toBe(1);
    expect(contenu.dateVersion).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(contenu.langue).toBe('fr');
  });

  it('incrémente la version à chaque enregistrement', async () => {
    const { usecase } = makeDeps({ sections: {}, version: 4 });

    const { contenu } = await usecase.execute({
      projetId: PROJET_ID,
      sections: sectionsCompletes(),
    });

    expect(contenu.version).toBe(5);
  });

  it("refuse un document incomplet et N'ENREGISTRE RIEN", async () => {
    const { usecase, projectRepository } = makeDeps();
    const sections = sectionsCompletes();
    delete (sections as Partial<Record<SectionFici, string>>)[
      SectionFici.FRAIS
    ];

    await expect(
      usecase.execute({ projetId: PROJET_ID, sections }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
  });

  it('rend le verdict section par section dans la réponse 400', async () => {
    const { usecase } = makeDeps();
    const sections = sectionsCompletes();
    delete (sections as Partial<Record<SectionFici, string>>)[
      SectionFici.FRAIS
    ];
    delete (sections as Partial<Record<SectionFici, string>>)[
      SectionFici.DROITS_ET_RECOURS
    ];

    const erreur = await usecase
      .execute({ projetId: PROJET_ID, sections })
      .catch((e) => e as BadRequestException);

    const payload = (erreur as BadRequestException).getResponse() as any;
    expect(payload.verdict.sectionsManquantes).toEqual([
      SectionFici.FRAIS,
      SectionFici.DROITS_ET_RECOURS,
    ]);
    expect(payload.verdict.intitulesManquants).toEqual([
      '7 — Frais',
      '8 — Vos droits et vos recours',
    ]);
    expect(payload.message).toContain(
      "Sections incomplètes dans le document d'informations clés :",
    );
  });

  it('refuse un document trop long, avec le message éditorial', async () => {
    const { usecase, projectRepository } = makeDeps();

    const erreur = await usecase
      .execute({
        projetId: PROJET_ID,
        sections: sectionsCompletes(),
        nombrePages: 9,
      })
      .catch((e) => e as BadRequestException);

    expect((erreur as BadRequestException).getResponse()).toMatchObject({
      message:
        'Le document compte 9 pages : la limite éditoriale est de 6 pages A4, annexes exclues.',
    });
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
  });

  it('traite une section blanche comme absente et ne la persiste pas', async () => {
    const { usecase } = makeDeps();
    const sections = { ...sectionsCompletes(), [SectionFici.FRAIS]: '    ' };

    await expect(
      usecase.execute({ projetId: PROJET_ID, sections }),
    ).rejects.toThrow(/7 — Frais/);
  });

  it('ignore une clé de section inconnue au lieu de la persister', async () => {
    const { usecase } = makeDeps();
    const sections = {
      ...sectionsCompletes(),
      offre_de_titres: 'ancienne clé, disparue du gabarit',
    } as any;

    const { contenu } = await usecase.execute({
      projetId: PROJET_ID,
      sections,
    });

    expect(Object.keys(contenu.sections)).not.toContain('offre_de_titres');
    expect(Object.keys(contenu.sections)).toHaveLength(8);
  });

  it('404 si le projet est introuvable', async () => {
    const { usecase, projectRepository } = makeDeps();
    projectRepository.findProjectById.mockResolvedValue(null);

    await expect(
      usecase.execute({ projetId: PROJET_ID, sections: sectionsCompletes() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
