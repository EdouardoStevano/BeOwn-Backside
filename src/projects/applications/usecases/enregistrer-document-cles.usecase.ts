import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../ports/repositories/project.repository';
import { Project } from 'src/projects/domains/project';
import {
  ContenuFici,
  LANGUE_ATTENDUE,
  INTITULES_SECTIONS,
  SECTIONS_REQUISES,
  SectionFici,
  VerdictFici,
  decrireVerdict,
  verifierFici,
} from 'src/projects/domains/fici';

export interface EnregistrerDocumentClesInput {
  projetId: string;
  sections: Partial<Record<SectionFici, string>>;
  nombrePages?: number;
  langue?: string;
}

export interface EnregistrerDocumentClesResult {
  projet: Project;
  contenu: ContenuFici;
  verdict: VerdictFici;
}

/**
 * Enregistre le document d'informations clés d'une opération.
 *
 * Règle : un document incomplet n'est PAS persisté. Le contrôle est formel
 * (complétude, longueur, langue) ; le fond reste sous la responsabilité du
 * porteur. Le refus porte le verdict section par section, pour que l'écran de
 * saisie puisse le rendre sans le reconstituer.
 *
 * Versionnage : `version` et `dateVersion` sont posés PAR LE SERVEUR à chaque
 * enregistrement (gabarit §5.1). La conservation des versions successives est
 * un point ouvert du gabarit (§7, point 4) : seule la version courante est
 * stockée à ce stade.
 */
@Injectable()
export class EnregistrerDocumentClesUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(
    input: EnregistrerDocumentClesInput,
  ): Promise<EnregistrerDocumentClesResult> {
    const projet = await this.projectRepository.findProjectById(input.projetId);
    if (!projet) throw new NotFoundException('Projet introuvable.');

    const contenu: ContenuFici = {
      sections: this.normaliserSections(input.sections),
      langue: input.langue ?? LANGUE_ATTENDUE,
      version: (projet.fici?.version ?? 0) + 1,
      dateVersion: new Date().toISOString(),
    };
    if (input.nombrePages != null) contenu.nombrePages = input.nombrePages;

    const verdict = verifierFici(contenu);
    if (!verdict.valide) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: decrireVerdict(verdict),
        verdict: {
          valide: false,
          sectionsManquantes: verdict.sectionsManquantes,
          intitulesManquants: verdict.sectionsManquantes.map(
            (section) => INTITULES_SECTIONS[section],
          ),
          anomalies: verdict.anomalies,
          message: decrireVerdict(verdict),
        },
      });
    }

    projet.fici = contenu;
    const sauvegarde = await this.projectRepository.updateProject(projet);

    return { projet: sauvegarde, contenu, verdict };
  }

  /**
   * Ne conserve que les clés connues et les textes non blancs : une section
   * blanche est traitée comme absente, jamais persistée comme une chaîne vide
   * qui donnerait l'illusion d'un document complet.
   */
  private normaliserSections(
    sections: Partial<Record<SectionFici, string>>,
  ): Partial<Record<SectionFici, string>> {
    const normalisees: Partial<Record<SectionFici, string>> = {};
    for (const cle of SECTIONS_REQUISES) {
      const texte = sections?.[cle];
      if (typeof texte === 'string' && texte.trim().length > 0) {
        normalisees[cle] = texte.trim();
      }
    }
    return normalisees;
  }
}
