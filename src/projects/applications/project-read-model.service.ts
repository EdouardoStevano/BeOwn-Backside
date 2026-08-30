import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GetProjectsUseCase } from './usecases/get-projects.usecase';
import { INVESTMENT_REPOSITORY } from 'src/investments/applications/ports/repositories/investment.repository';
import type { InvestmentRepository } from 'src/investments/applications/ports/repositories/investment.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { AVIS_REPOSITORY } from 'src/avis/applications/ports/repositories/avis.repository';
import type { AvisRepository } from 'src/avis/applications/ports/repositories/avis.repository';
import { DocumentType } from 'src/documents/domains/enums/document-type.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

/**
 * Construction des read-models « projet » : enrichissement des listes
 * (fractions vendues/disponibles, images) et vue détail agrégée (collecte,
 * investisseurs, images/documents, avis). Extrait verbatim de ProjectController
 * (helpers enrichFractions / enrichImages / buildProjectDetail) — SOLID vague 4.
 * Regroupe les requêtes batch pour limiter les N+1.
 */
@Injectable()
export class ProjectReadModelService {
  constructor(
    private readonly getProjects: GetProjectsUseCase,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
  ) {}

  /**
   * Statuts d'investissement qui comptent dans les agrégats d'un projet :
   * l'engagement est pris (ou déjà dénoué par un remboursement), la ligne
   * représente donc un investisseur réel. Les lignes annulées, expirées ou en
   * attente de paiement en sont exclues.
   *
   * Source UNIQUE pour la liste (`enrichFractions`) et le détail
   * (`buildProjectDetail`) : les deux vues doivent compter la même chose.
   */
  private static readonly STATUTS_ACTIFS: InvestmentStatus[] = [
    InvestmentStatus.CONFIRME,
    InvestmentStatus.EN_DELAI_RETRACTATION,
    InvestmentStatus.SIGNE,
    InvestmentStatus.PAYE,
    InvestmentStatus.REMBOURSE_CAPITAL,
    InvestmentStatus.REMBOURSE_TOTAL,
  ];

  /** Investisseurs DISTINCTS d'un projet : une personne, une voix, quel que soit son nombre de lignes. */
  private compterInvestisseurs(
    investments: { statut: InvestmentStatus; utilisateurId: number }[],
  ): number {
    return new Set(
      investments
        .filter((i) =>
          ProjectReadModelService.STATUTS_ACTIFS.includes(i.statut),
        )
        .map((i) => i.utilisateurId),
    ).size;
  }

  async enrichFractions(projects: any[]) {
    if (projects.length === 0) return projects;
    const ids = projects.map((p) => p.id);
    // `nbInvestisseurs` était câblé à 0 : la liste annonçait « 0 investisseur »
    // sur des projets intégralement souscrits, alors que le détail affichait le
    // bon compte. Une requête par projet, comme enrichImages ; le port
    // d'investissement n'expose pas encore de compteur groupé (suivi : ajouter
    // un `countInvestisseursBatch` côté investments, hors périmètre ici).
    const [venduesMap, investissementsParProjet] = await Promise.all([
      this.investmentRepository.countFractionsVenduesBatch(ids),
      Promise.all(
        ids.map((id) => this.investmentRepository.findByProjetId(id)),
      ),
    ]);
    const investisseursParProjet = new Map<string, number>(
      ids.map((id, index) => [
        id,
        this.compterInvestisseurs(investissementsParProjet[index]),
      ]),
    );

    return projects.map((p) => {
      const prixFraction = Number(p.ticketMinimum);
      const nbFractionsTotal =
        p.nbFractions ?? Math.floor(Number(p.capitalCible) / prixFraction);
      const fractionsVendues = venduesMap[p.id] ?? 0;
      const fractionsDisponibles = Math.max(
        0,
        nbFractionsTotal - fractionsVendues,
      );
      const tauxRemplissage =
        nbFractionsTotal > 0
          ? Math.min(
              100,
              Math.round((fractionsVendues / nbFractionsTotal) * 1000) / 10,
            )
          : 0;
      return {
        ...p,
        fractions: {
          total: nbFractionsTotal,
          vendues: fractionsVendues,
          disponibles: fractionsDisponibles,
          prix: prixFraction,
        },
        stats: {
          montantCollecte: fractionsVendues * prixFraction,
          nbInvestisseurs: investisseursParProjet.get(p.id) ?? 0,
          tauxRemplissage,
        },
      };
    });
  }

  async enrichImages(projects: any[]) {
    if (projects.length === 0) return projects;
    const imagesByProject = await Promise.all(
      projects.map((p) => this.documentRepository.findByProjectId(p.id)),
    );
    return projects.map((p, i) => {
      const images = imagesByProject[i]
        .filter(
          (d) => d.type === DocumentType.PHOTO_PROJET && d.isPublic === true,
        )
        .sort((a, b) => {
          if (a.estPrincipale !== b.estPrincipale)
            return a.estPrincipale ? -1 : 1;
          return (a.ordre ?? 999) - (b.ordre ?? 999);
        });
      return { ...p, images };
    });
  }

  async buildProjectDetail(id: string, publicView = false) {
    const [project, allInvestments, allDocs, avisStats, fractionsVendues] =
      await Promise.all([
        this.getProjects.executeOne(id),
        this.investmentRepository.findByProjetId(id),
        this.documentRepository.findByProjectId(id),
        this.avisRepository.getStats(id),
        this.investmentRepository.countFractionsVendues(id),
      ]);

    if (!project) throw new NotFoundException('Projet introuvable.');

    const prixFraction = Number(project.ticketMinimum);
    const nbFractionsTotal =
      project.nbFractions ??
      Math.floor(Number(project.capitalCible) / prixFraction);

    const activeInvestments = allInvestments.filter((i) =>
      ProjectReadModelService.STATUTS_ACTIFS.includes(i.statut),
    );
    const montantCollecte = activeInvestments.reduce(
      (sum, inv) => sum + Number(inv.montant),
      0,
    );
    const nbInvestisseurs = this.compterInvestisseurs(allInvestments);

    const images = allDocs
      .filter(
        (d) =>
          d.type === DocumentType.PHOTO_PROJET &&
          (!publicView || d.isPublic === true),
      )
      .sort((a, b) => {
        if (a.estPrincipale !== b.estPrincipale)
          return a.estPrincipale ? -1 : 1;
        return (a.ordre ?? 999) - (b.ordre ?? 999);
      });

    const documents = allDocs.filter(
      (d) =>
        d.type !== DocumentType.PHOTO_PROJET &&
        (!publicView || d.isPublic === true),
    );

    return {
      ...project,
      prixFraction,
      localisation: {
        adresseComplete: project.adresseComplete,
        ville: project.ville,
        region: project.region,
        pays: project.pays,
        latitude: project.latitude,
        longitude: project.longitude,
      },
      images,
      documents,
      avis: avisStats,
      fractions: {
        total: nbFractionsTotal,
        vendues: fractionsVendues,
        disponibles: Math.max(0, nbFractionsTotal - fractionsVendues),
        prix: prixFraction,
      },
      stats: {
        montantCollecte,
        nbInvestisseurs,
        tauxRemplissage:
          nbFractionsTotal > 0
            ? Math.min(
                100,
                Math.round((fractionsVendues / nbFractionsTotal) * 1000) / 10,
              )
            : null,
      },
    };
  }
}
