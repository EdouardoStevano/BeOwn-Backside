import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GetProjectsUseCase } from './usecases/get-projects.usecase';
import { INVESTMENT_REPOSITORY } from 'src/investments/applications/ports/repositories/investment.repository';
import type {
  AgregatInvestissementsProjet,
  InvestmentRepository,
} from 'src/investments/applications/ports/repositories/investment.repository';
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

  /**
   * Agrégats d'un projet, calculés EN BASE (une requête pour tous les projets).
   *
   * ─── Montant collecté ───────────────────────────────────────────────────
   * Σ des investissements aux STATUTS ACTIFS. DÉFINITION UNIQUE pour la liste
   * et le détail. La liste calculait `fractionsVendues × prixFraction`, le
   * détail sommait les montants réels : les deux vues affichaient des chiffres
   * différents pour le même projet. L'écart n'est pas théorique — une cession
   * au marché secondaire mute le `montant` de la ligne au prix de revente sans
   * changer le nombre de fractions, si bien que le produit « fractions × prix
   * d'origine » dérive dès la première revente. C'est la définition du DÉTAIL
   * qui est retenue : elle somme ce qui a réellement été engagé.
   *
   * ─── Investisseurs ──────────────────────────────────────────────────────
   * Personnes DISTINCTES : une personne, une voix, quel que soit son nombre de
   * lignes.
   *
   * ─── Pourquoi en base ───────────────────────────────────────────────────
   * Ces deux chiffres venaient d'un `findByProjetId` PAR PROJET, chacun
   * rapatriant toutes les lignes d'investissement AVEC le projet joint (blob
   * `fici` ~2,4 Ko, `descriptionMd`, `previsionnel` — répétés sur chaque
   * ligne) pour n'en tirer qu'une somme et un compte. Une liste de 20 projets
   * valait 20 requêtes et des mégaoctets transférés. C'est désormais UNE
   * requête GROUP BY qui ne remonte que les agrégats.
   */
  private async agregerCollecte(
    ids: string[],
  ): Promise<Record<string, AgregatInvestissementsProjet>> {
    return this.investmentRepository.agregerParProjet(
      ids,
      ProjectReadModelService.STATUTS_ACTIFS,
    );
  }

  /** Arrondi monétaire au centime, appliqué à la somme rendue par la base. */
  private auCentime(montant: number): number {
    return Math.round(montant * 100) / 100;
  }

  async enrichFractions(projects: any[]) {
    if (projects.length === 0) return projects;
    const ids = projects.map((p) => p.id);
    // DEUX requêtes pour toute la liste, quel qu'en soit le nombre de projets
    // (c'était 1 + N, avec le projet entier joint sur chaque ligne).
    const [venduesMap, agregats] = await Promise.all([
      this.investmentRepository.countFractionsVenduesBatch(ids),
      this.agregerCollecte(ids),
    ]);

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
          // MÊME définition que le détail : Σ des investissements actifs.
          montantCollecte: this.auCentime(
            agregats[p.id]?.montantCollecte ?? 0,
          ),
          nbInvestisseurs: agregats[p.id]?.nbInvestisseurs ?? 0,
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
    const [project, agregats, allDocs, avisStats, fractionsVendues] =
      await Promise.all([
        this.getProjects.executeOne(id),
        // Le détail chargeait, lui aussi, TOUTES les lignes d'investissement
        // du projet — projet joint compris — pour n'en tirer que deux
        // chiffres. Même agrégat que la liste, donc mêmes chiffres par
        // construction.
        this.agregerCollecte([id]),
        this.documentRepository.findByProjectId(id),
        this.avisRepository.getStats(id),
        this.investmentRepository.countFractionsVendues(id),
      ]);

    if (!project) throw new NotFoundException('Projet introuvable.');

    const prixFraction = Number(project.ticketMinimum);
    const nbFractionsTotal =
      project.nbFractions ??
      Math.floor(Number(project.capitalCible) / prixFraction);

    const montantCollecte = this.auCentime(
      agregats[id]?.montantCollecte ?? 0,
    );
    const nbInvestisseurs = agregats[id]?.nbInvestisseurs ?? 0;

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
