import { Inject, Injectable, Logger } from '@nestjs/common';
import { Project } from 'src/catalog/domain/aggregates/project';
import { ProjetIntrouvableError } from 'src/catalog/domain/errors';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';
import {
  PROJECT_PHOTO_STORAGE,
  type FichierImage,
  type ProjectPhotoStorage,
} from '../../ports/project-photo-storage.port';

/**
 * Les cinq gestes de tenue de la galerie d'une fiche.
 *
 * Même dessin que {@link GererBlocsDeContenuUseCase}, avec une responsabilité de
 * plus, et elle est bien à ce niveau : **l'ordre entre le stockage du fichier et
 * l'écriture de l'agrégat**. Le domaine ne connaît pas le stockage (§20, §32),
 * et l'adapter ne connaît pas la galerie ; seul le cas d'usage voit les deux, et
 * c'est donc lui qui décide lequel passe en premier.
 *
 * Il le décide dans le sens qui ne perd rien :
 *
 * - à l'ajout, **le fichier d'abord**. Si l'écriture en base échoue ensuite, il
 *   reste un objet orphelin dans le stockage — quelques octets que personne ne
 *   référence. L'ordre inverse produirait une photo référencée par la fiche
 *   dont le fichier n'existe pas : une image cassée sur le site public ;
 * - au retrait, **la base d'abord**. Si l'effacement échoue ensuite, même
 *   orphelin, même conséquence bénigne. L'ordre inverse effacerait un fichier
 *   encore référencé.
 *
 * Le principe est le même que celui de l'Outbox (§19) : entre deux systèmes que
 * rien ne rend transactionnels ensemble, on choisit le sens dont la panne est
 * réparable.
 */
@Injectable()
export class GererPhotosDuProjetUseCase {
  private readonly logger = new Logger(GererPhotosDuProjetUseCase.name);

  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_PHOTO_STORAGE)
    private readonly stockage: ProjectPhotoStorage,
  ) {}

  /**
   * Dépose une photo. La première déposée devient la vignette du projet.
   *
   * Le projet est **chargé avant** le téléversement : inutile d'écrire un
   * fichier dans le stockage pour découvrir ensuite que le projet n'existe pas.
   */
  async ajouter(
    projetId: string,
    fichier: FichierImage,
    depose: { par: number; texteAlternatif?: string | null },
  ): Promise<Project> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet) throw new ProjetIntrouvableError();

    const { cleStockage, url } = await this.stockage.deposer(fichier);

    projet.ajouterPhoto({
      url,
      cleStockage,
      nomOriginal: fichier.nomOriginal,
      mimeType: fichier.mimeType,
      tailleOctets: fichier.tailleOctets,
      texteAlternatif: depose.texteAlternatif ?? null,
      deposeePar: depose.par,
    });

    return this.projectRepository.saveProject(projet);
  }

  /** @see Project.designerPhotoPrincipale — l'ancienne vignette est décoiffée ici même. */
  async designerPrincipale(
    projetId: string,
    photoId: string,
  ): Promise<Project> {
    return this.editer(projetId, (projet) =>
      projet.designerPhotoPrincipale(photoId),
    );
  }

  async deplacer(
    projetId: string,
    photoId: string,
    position: number,
  ): Promise<Project> {
    return this.editer(projetId, (projet) =>
      projet.deplacerPhoto(photoId, position),
    );
  }

  async decrire(
    projetId: string,
    photoId: string,
    texteAlternatif: string | null,
  ): Promise<Project> {
    return this.editer(projetId, (projet) =>
      projet.decrirePhoto(photoId, texteAlternatif),
    );
  }

  /**
   * Retire une photo de la galerie, puis efface son fichier.
   *
   * L'échec de l'effacement n'est pas remonté : la photo a bien quitté la fiche,
   * et faire répondre 500 à une suppression réussie inviterait l'administrateur
   * à la rejouer sur une photo qui n'existe plus. L'orphelin est journalisé.
   */
  async retirer(projetId: string, photoId: string): Promise<Project> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet) throw new ProjetIntrouvableError();

    const cleLiberee = projet.retirerPhoto(photoId);
    const enregistre = await this.projectRepository.saveProject(projet);

    try {
      await this.stockage.effacer(cleLiberee);
    } catch (erreur) {
      this.logger.warn(
        `Photo ${photoId} retirée du projet ${projetId}, mais l'objet « ${cleLiberee} » n'a pas pu être effacé : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      );
    }

    return enregistre;
  }

  /** @see GererBlocsDeContenuUseCase.editer — même tronc commun. */
  private async editer(
    projetId: string,
    geste: (projet: Project) => void,
  ): Promise<Project> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet) throw new ProjetIntrouvableError();

    geste(projet);

    return this.projectRepository.saveProject(projet);
  }
}
