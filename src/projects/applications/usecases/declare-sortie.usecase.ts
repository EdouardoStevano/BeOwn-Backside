import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SortieProjet, StatutSortie } from '../../domains/sortie-projet';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../ports/repositories/project.repository';
import {
  SORTIE_PROJET_REPOSITORY,
  type SortieProjetRepository,
} from '../ports/repositories/sortie-projet.repository';
import { ModeleEconomique } from '../../domains/enums/modele-economique.enum';
import { ProjectStatus } from '../../domains/enums/project-status.enum';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DeclareSortieInput {
  projetId: string;
  prixRevente: number;
  dateRevente: Date;
  acteVentePdfUrl?: string | null;
}

@Injectable()
export class DeclareSortieUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    @Inject(SORTIE_PROJET_REPOSITORY)
    private readonly sortieRepo: SortieProjetRepository,
  ) {}

  async execute(input: DeclareSortieInput): Promise<SortieProjet> {
    const projet = await this.projectRepo.findProjectById(input.projetId);
    if (!projet) throw new NotFoundException('Projet introuvable.');

    if (projet.modeleEconomique !== ModeleEconomique.EQUITY) {
      throw new BadRequestException(
        `Sortie disponible uniquement pour modèle EQUITY (actuel: ${projet.modeleEconomique}).`,
      );
    }
    if (projet.statut !== ProjectStatus.FINANCE) {
      throw new BadRequestException(
        `Projet doit être en statut FINANCE (actuel: ${projet.statut}).`,
      );
    }
    if (input.prixRevente <= 0) {
      throw new BadRequestException('Le prix de revente doit être positif.');
    }

    // Vérifier qu'il n'existe pas déjà une sortie non annulée
    const existing = await this.sortieRepo.findByProjet(input.projetId);
    const enCours = existing.find(
      (s) =>
        s.statut === StatutSortie.PROJETEE ||
        s.statut === StatutSortie.ACTEE ||
        s.statut === StatutSortie.DISTRIBUEE,
    );
    if (enCours) {
      throw new BadRequestException(
        `Une sortie existe déjà pour ce projet (statut: ${enCours.statut}).`,
      );
    }

    const s = new SortieProjet();
    s.projetId = input.projetId;
    s.prixRevente = round2(input.prixRevente);
    s.dateRevente = input.dateRevente;
    s.plusValueBrute = round2(input.prixRevente - Number(projet.capitalCible));
    s.statut = input.acteVentePdfUrl
      ? StatutSortie.ACTEE
      : StatutSortie.PROJETEE;
    s.acteVentePdfUrl = input.acteVentePdfUrl ?? null;
    return this.sortieRepo.save(s);
  }
}
