import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STATUTS_PROJET_CESSIBLES,
  SortieProjet,
  StatutSortie,
} from '../../domains/sortie-projet';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../ports/repositories/project.repository';
import {
  SORTIE_PROJET_REPOSITORY,
  type SortieProjetRepository,
} from '../ports/repositories/sortie-projet.repository';
import { ModeleEconomique } from '../../domains/enums/modele-economique.enum';

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
    // Un bien mis en location passe en `en_exploitation` : le limiter à
    // `finance` rendait toute cession indéclarable dès la première mise en
    // location, c'est-à-dire dans le cas nominal.
    if (!STATUTS_PROJET_CESSIBLES.includes(projet.statut)) {
      throw new BadRequestException(
        `Une cession ne peut être déclarée que sur un projet financé ou en exploitation (statut actuel : ${projet.statut}).`,
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
