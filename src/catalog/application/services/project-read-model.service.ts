import { Inject, Injectable } from '@nestjs/common';
import { AVIS_REPOSITORY } from 'src/catalog/domain/repositories/avis.repository';
import type { AvisRepository } from 'src/catalog/domain/repositories/avis.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/domain/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/domain/repositories/document.repository';
// Un read model expose l'état des documents, pas leurs agrégats (§11).
import type { SignableDocumentSnapshot } from 'src/documents/domain/aggregates/signable-document';
import { DocumentType } from 'src/documents/domain/enums/document-type.enum';
import { INVESTMENT_REPOSITORY } from 'src/subscription/domain/repositories/investment.repository';
import type { InvestmentRepository } from 'src/subscription/domain/repositories/investment.repository';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { ProjetIntrouvableError } from 'src/catalog/domain/errors';
import { Project, ProjectSnapshot } from 'src/catalog/domain/aggregates/project';
import { LocalisationSnapshot } from 'src/catalog/domain/value-objects/localisation.vo';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../domain/repositories/project.repository';

/** Où en est la vente des fractions d'un projet. */
export interface FractionsProjet {
  total: number;
  vendues: number;
  disponibles: number;
  /** @see ConditionsFinancieres.prixUnitaireFraction */
  prix: number;
}

export interface StatsCollecte {
  montantCollecte: number;
  nbInvestisseurs: number;
  /** Pourcentage à une décimale. `null` quand le projet n'a aucune fraction. */
  tauxRemplissage: number | null;
}

export type ProjetEnListe = ProjectSnapshot & {
  fractions: FractionsProjet;
  stats: StatsCollecte;
};

export type ProjetEnListeAvecImages = ProjetEnListe & {
  images: SignableDocumentSnapshot[];
};

export type ProjetDetaille = ProjectSnapshot & {
  /**
   * ⚠️ Écrase délibérément la colonne `prixFraction` du projet par le prix
   * réellement pratiqué, qui est le ticket minimum. Le comportement est repris
   * tel quel : le front lit cette clé et attend cette valeur.
   * @see ConditionsFinancieres.prixUnitaireFraction
   */
  prixFraction: number;
  /** Doublon assumé des champs à plat, que le front consomme groupés. */
  localisation: LocalisationSnapshot;
  images: SignableDocumentSnapshot[];
  documents: SignableDocumentSnapshot[];
  avis: { noteMoyenne: number; nbAvis: number };
  fractions: FractionsProjet;
  stats: StatsCollecte;
};

/**
 * Composition des read-models « projet ».
 *
 * Côté lecture, on ne repasse pas par l'agrégat pour appliquer des règles : ces
 * vues agrègent des projections de quatre contextes — projets, investissements,
 * documents, avis — et sont dénormalisées pour l'affichage (§7). Le service ne
 * décide rien ; il assemble, et regroupe ses requêtes pour éviter les N+1.
 *
 * Deux corrections par rapport à la version extraite du contrôleur :
 *
 * - il ne manipule plus des `any[]`. Les vues étaient composées par
 *   décomposition d'un `Project` (`{ ...p, fractions, stats }`), ce qui rendait
 *   le contrat de sortie invisible ; l'agrégat n'ayant plus d'attributs
 *   publics, la décomposition ne rendrait d'ailleurs que ses champs privés —
 *   elles partent maintenant de `toSnapshot()` ;
 * - le nombre total de fractions et le prix unitaire ne sont plus recalculés
 *   ici : ce sont des règles du projet, portées par
 *   `ConditionsFinancieres`. Les deux méthodes en avaient chacune leur copie.
 */
@Injectable()
export class ProjectReadModelService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
  ) {}

  /** Ajoute à chaque projet l'état de sa collecte, en une seule requête batch. */
  async enrichFractions(projets: Project[]): Promise<ProjetEnListe[]> {
    if (projets.length === 0) return [];

    const venduesParProjet =
      await this.investmentRepository.countFractionsVenduesBatch(
        projets.map((p) => p.id),
      );

    return projets.map((projet) => {
      const total = projet.nbFractionsTotal;
      const prix = projet.prixUnitaireFraction;
      const vendues = venduesParProjet[projet.id] ?? 0;

      return {
        ...projet.toSnapshot(),
        fractions: {
          total,
          vendues,
          disponibles: Math.max(0, total - vendues),
          prix,
        },
        stats: {
          montantCollecte: vendues * prix,
          // Non calculé en liste : il faudrait charger tous les
          // investissements de chaque projet. Le détail le renseigne.
          nbInvestisseurs: 0,
          tauxRemplissage: tauxRemplissage(vendues, total) ?? 0,
        },
      };
    });
  }

  /** Ajoute les photos publiques, triées : principale d'abord, puis par ordre. */
  async enrichImages(
    projets: ProjetEnListe[],
  ): Promise<ProjetEnListeAvecImages[]> {
    if (projets.length === 0) return [];

    const documentsParProjet = await Promise.all(
      projets.map((projet) =>
        this.documentRepository.findByProjectId(projet.id),
      ),
    );

    return projets.map((projet, i) => ({
      ...projet,
      images: photosPubliques(etatsDe(documentsParProjet[i]), true),
    }));
  }

  /**
   * Vue détaillée d'un projet : collecte, investisseurs, images, documents,
   * avis.
   *
   * @param vuePublique restreint images et documents à ceux marqués publics.
   */
  async buildProjectDetail(
    id: string,
    vuePublique = false,
  ): Promise<ProjetDetaille> {
    const [projet, investissements, documents, avis, fractionsVendues] =
      await Promise.all([
        this.projectRepository.findProjectById(id),
        this.investmentRepository.findByProjetId(id),
        this.documentRepository.findByProjectId(id),
        this.avisRepository.getStats(id),
        this.investmentRepository.countFractionsVendues(id),
      ]);

    if (!projet) throw new ProjetIntrouvableError();

    const actifs = investissements.filter((i) =>
      STATUTS_INVESTISSEMENT_ACTIFS.includes(i.statut),
    );
    const total = projet.nbFractionsTotal;
    const prix = projet.prixUnitaireFraction;

    return {
      ...projet.toSnapshot(),
      prixFraction: prix,
      localisation: projet.localisation.toSnapshot(),
      images: photosPubliques(etatsDe(documents), vuePublique),
      documents: etatsDe(documents).filter(
        (d) =>
          d.type !== DocumentType.PHOTO_PROJET &&
          (!vuePublique || d.isPublic === true),
      ),
      avis,
      fractions: {
        total,
        vendues: fractionsVendues,
        disponibles: Math.max(0, total - fractionsVendues),
        prix,
      },
      stats: {
        montantCollecte: actifs.reduce((s, inv) => s + Number(inv.montant), 0),
        nbInvestisseurs: new Set(actifs.map((i) => i.utilisateurId)).size,
        tauxRemplissage: tauxRemplissage(fractionsVendues, total),
      },
    };
  }
}

/**
 * Investissements qui comptent dans le montant collecté : tout sauf les
 * rétractés et les annulés. Les remboursés en font partie — ils ont bien été
 * collectés.
 */
const STATUTS_INVESTISSEMENT_ACTIFS: readonly InvestmentStatus[] = [
  InvestmentStatus.CONFIRME,
  InvestmentStatus.SIGNE,
  InvestmentStatus.PAYE,
  InvestmentStatus.REMBOURSE_CAPITAL,
  InvestmentStatus.REMBOURSE_TOTAL,
];

/** L'état des documents, seul lisible par un read model. */
const etatsDe = (documents: { snapshot(): SignableDocumentSnapshot }[]) =>
  documents.map((d) => d.snapshot());

/** Photo principale d'abord, puis par `ordre` croissant, non ordonnées en fin. */
function photosPubliques(
  documents: SignableDocumentSnapshot[],
  vuePublique: boolean,
): SignableDocumentSnapshot[] {
  return documents
    .filter(
      (d) =>
        d.type === DocumentType.PHOTO_PROJET &&
        (!vuePublique || d.isPublic === true),
    )
    .sort((a, b) => {
      if (a.estPrincipale !== b.estPrincipale) return a.estPrincipale ? -1 : 1;
      return (a.ordre ?? 999) - (b.ordre ?? 999);
    });
}

/** Pourcentage à une décimale, plafonné à 100. `null` si aucune fraction. */
function tauxRemplissage(vendues: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((vendues / total) * 1000) / 10);
}
