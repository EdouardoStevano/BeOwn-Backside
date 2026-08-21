import { Inject, Injectable } from '@nestjs/common';
import { AVIS_REPOSITORY } from 'src/avis/applications/ports/repositories/avis.repository';
import type { AvisRepository } from 'src/avis/applications/ports/repositories/avis.repository';
import { Avis } from 'src/avis/domains/avis';
import {
  AvisDejaSoumisError,
  ProjetIntrouvableError,
} from 'src/projects/domains/errors';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../ports/repositories/project.repository';

export interface AvisProjet {
  noteMoyenne: number;
  nbAvis: number;
  avis: Avis[];
}

export interface SoumettreAvisProps {
  projetId: string;
  utilisateurId: number;
  note: number;
  commentaire?: string | null;
}

/**
 * Les avis d'un projet : les lire, en déposer un.
 *
 * ⚠️ **Ces deux opérations appartiennent au contexte Avis**, pas à Projects.
 * Elles sont ici parce que les routes qui les portent — `GET`/`POST
 * /projects/:id/avis` — sont publiées par ce contexte, et parce qu'elles
 * étaient jusqu'ici écrites dans `ProjectController` : la liste des statuts
 * éligibles en dur, la recherche d'un avis existant, puis la fabrication d'un
 * agrégat `Avis` à la main — un contexte qui construit l'agrégat d'un autre,
 * depuis sa couche présentation (§12.5).
 *
 * Les sortir du contrôleur est le premier pas. Le second est de les déplacer
 * dans `src/avis/` avec `AvisDejaSoumisError` et une fabrique `AvisFactory`,
 * Projects ne gardant que la garde d'éligibilité du projet. Ce déplacement
 * touche le contexte Avis : il n'entre pas dans le périmètre de ce refactor.
 */
@Injectable()
export class ConsultAvisProjetUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
  ) {}

  /**
   * Avis et note moyenne d'un projet ouvert aux investisseurs.
   *
   * Un projet non éligible répond comme un projet inexistant : la liste des
   * avis ne doit pas renseigner sur l'existence d'un dossier qui n'est pas
   * public.
   */
  async lister(projetId: string): Promise<AvisProjet> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet || !projet.estOuvertAuxInvestisseurs()) {
      throw new ProjetIntrouvableError();
    }

    const [avis, stats] = await Promise.all([
      this.avisRepository.findByProjetId(projetId),
      this.avisRepository.getStats(projetId),
    ]);
    return { ...stats, avis };
  }

  /**
   * Dépose l'avis d'un compte sur un projet — un seul par compte et par projet.
   *
   * ⚠️ Changement de comportement assumé : le dépôt exigeait seulement que le
   * projet **existe**, là où sa lecture exigeait qu'il soit ouvert aux
   * investisseurs. On pouvait donc noter un brouillon, ou un projet annulé, et
   * ne jamais revoir son propre avis. Les deux routes partagent désormais la
   * même garde.
   */
  async soumettre(props: SoumettreAvisProps): Promise<Avis> {
    const projet = await this.projectRepository.findProjectById(props.projetId);
    if (!projet || !projet.estOuvertAuxInvestisseurs()) {
      throw new ProjetIntrouvableError();
    }

    const existant = await this.avisRepository.findByUserAndProjet(
      props.utilisateurId,
      props.projetId,
    );
    if (existant) throw new AvisDejaSoumisError();

    const avis = new Avis();
    avis.projetId = props.projetId;
    avis.userId = props.utilisateurId;
    avis.note = props.note;
    avis.commentaire = props.commentaire ?? null;

    return this.avisRepository.save(avis);
  }
}
