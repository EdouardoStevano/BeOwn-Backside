import { Inject, Injectable } from '@nestjs/common';
import { StatutSortie } from 'src/catalog/domain/enums/statut-sortie.enum';
import { SortieIntrouvableError } from 'src/catalog/domain/errors';
import { SortieProjet } from 'src/catalog/domain/aggregates/sortie-projet';
import {
  SORTIE_PROJET_REPOSITORY,
  type SortieProjetRepository,
} from '../../../domain/repositories/sortie-projet.repository';

/**
 * Les gestes d'administration sur une sortie déjà déclarée : la marquer actée,
 * l'annuler, la lister.
 *
 * `AdminSortiesController` les faisait lui-même — charger la sortie, vérifier
 * son statut par un `if`, écrire `s.statut = StatutSortie.ACTEE`, rappeler le
 * repository (§12.5), qu'il injectait au passage (§12.9). Les transitions sont
 * revenues à l'agrégat ; ne reste ici que le chargement et l'enregistrement.
 *
 * ⚠️ Changement de comportement assumé : une sortie inconnue rendait un **400**
 * (`BadRequestException('Sortie introuvable.')`) sur ces deux routes, et un 404
 * sur l'exécution. Les trois rendent maintenant un 404, qui est le statut juste
 * et celui que le troisième chemin rendait déjà.
 */
@Injectable()
export class ManageSortieUseCase {
  constructor(
    @Inject(SORTIE_PROJET_REPOSITORY)
    private readonly sortieRepo: SortieProjetRepository,
  ) {}

  /** L'acte de vente est signé : la sortie devient exécutable. */
  async marquerActee(
    sortieId: string,
    acteVentePdfUrl: string,
  ): Promise<SortieProjet> {
    const sortie = await this.charger(sortieId);
    sortie.marquerActee(acteVentePdfUrl);
    return this.sortieRepo.save(sortie);
  }

  /** Annulation, possible tant que rien n'a été versé aux investisseurs. */
  async annuler(sortieId: string): Promise<SortieProjet> {
    const sortie = await this.charger(sortieId);
    sortie.annuler();
    return this.sortieRepo.save(sortie);
  }

  listerParStatut(statut: StatutSortie): Promise<SortieProjet[]> {
    return this.sortieRepo.findByStatut(statut);
  }

  listerParProjet(projetId: string): Promise<SortieProjet[]> {
    return this.sortieRepo.findByProjet(projetId);
  }

  private async charger(sortieId: string): Promise<SortieProjet> {
    const sortie = await this.sortieRepo.findById(sortieId);
    if (!sortie) throw new SortieIntrouvableError();
    return sortie;
  }
}
