import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../ports/repositories/project.repository';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import {
  AVERTISSEMENTS,
  INTITULES_SECTIONS,
  LANGUE_ATTENDUE,
  NOMBRE_MAX_PAGES,
  SectionRendue,
  VerdictFici,
  decrireVerdict,
  rendreSections,
  verifierFici,
} from 'src/projects/domains/fici';

export interface VueDocumentCles {
  projetId: string;
  slug: string;
  titre: string;
  statut: ProjectStatus;
  /** Version courante du document, ou null si aucun document n'est enregistré. */
  version: number | null;
  dateVersion: string | null;
  langue: string;
  nombrePages: number | null;
  nombreMaxPages: number;
  sections: SectionRendue[];
  avertissements: typeof AVERTISSEMENTS;
  verdict: {
    valide: boolean;
    sectionsManquantes: string[];
    intitulesManquants: string[];
    anomalies: string[];
    message: string;
  };
}

/**
 * Lecture du document d'informations clés.
 *
 * Deux chemins volontairement distincts :
 *
 *  - `pourAdmin` sert le document tel qu'il est, complet ou non : l'écran de
 *    saisie doit pouvoir reprendre un brouillon et voir ce qui manque ;
 *  - `pourPublic` ne sert QUE les opérations sorties du brouillon et
 *    effectivement dotées d'un document. Un brouillon est introuvable, même si
 *    son slug est deviné : le slug dérive du titre, il n'est pas un secret.
 */
@Injectable()
export class ConsulterDocumentClesUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async pourAdmin(projetId: string): Promise<VueDocumentCles> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet) throw new NotFoundException('Projet introuvable.');
    return this.projeter(projet);
  }

  async pourPublic(slug: string): Promise<VueDocumentCles> {
    const projet = await this.projectRepository.findProjectBySlug(slug);
    if (!projet || projet.statut === ProjectStatus.BROUILLON) {
      throw new NotFoundException('Projet introuvable.');
    }
    if (!projet.fici) {
      throw new NotFoundException(
        "Aucun document d'informations clés n'est publié pour cette opération.",
      );
    }
    return this.projeter(projet);
  }

  private projeter(projet: {
    id: string;
    slug: string;
    titre: string;
    statut: ProjectStatus;
    fici: import('src/projects/domains/fici').ContenuFici | null;
  }): VueDocumentCles {
    const contenu = projet.fici;
    const verdict: VerdictFici = verifierFici(contenu ?? { sections: {} });

    return {
      projetId: projet.id,
      slug: projet.slug,
      titre: projet.titre,
      statut: projet.statut,
      version: contenu?.version ?? null,
      dateVersion: contenu?.dateVersion ?? null,
      langue: contenu?.langue ?? LANGUE_ATTENDUE,
      nombrePages: contenu?.nombrePages ?? null,
      nombreMaxPages: NOMBRE_MAX_PAGES,
      sections: rendreSections(contenu),
      avertissements: AVERTISSEMENTS,
      verdict: {
        valide: verdict.valide,
        sectionsManquantes: verdict.sectionsManquantes,
        intitulesManquants: verdict.sectionsManquantes.map(
          (section) => INTITULES_SECTIONS[section],
        ),
        anomalies: verdict.anomalies,
        message: decrireVerdict(verdict),
      },
    };
  }
}
