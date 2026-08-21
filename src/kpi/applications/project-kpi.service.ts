import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import {
  computeWal,
  deriveEcheanceStatus,
} from 'src/kpi/domains/kpi-calculator';
import {
  EcheanceComputedStatus,
  ProjectEcheanceLine,
  ProjectPublicKpis,
} from 'src/kpi/domains/types';

const CACHE_KEY_PREFIX = 'project-kpi:';
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Seuls les investissements réellement engagés alimentent le capital collecté :
 * un panier abandonné (INITIE, PAIEMENT_ATTENDU) ou rétracté ne compte pas.
 */
const STATUTS_ENGAGES = [
  InvestmentStatus.PAYE,
  InvestmentStatus.SIGNE,
  InvestmentStatus.CONFIRME,
  InvestmentStatus.EN_DELAI_RETRACTATION,
  InvestmentStatus.REMBOURSE_CAPITAL,
  InvestmentStatus.REMBOURSE_TOTAL,
];

/**
 * Correspondances exhaustives : ajouter un statut calculé force (via le Record)
 * à décider ici de sa projection, plutôt que d'étendre un switch.
 */
const LIGNE_PAR_STATUT: Record<
  EcheanceComputedStatus,
  ProjectEcheanceLine['statut']
> = {
  payee: 'payee',
  a_venir: 'a_venir',
  retard_leger: 'retard',
  retard_significatif: 'retard',
  defaut: 'defaut',
  perte_definitive: 'defaut',
};

const GRAVITE_LIGNE: Record<ProjectEcheanceLine['statut'], number> = {
  payee: 0,
  a_venir: 1,
  retard: 2,
  defaut: 3,
};

const SANTE_PAR_STATUT: Record<
  EcheanceComputedStatus,
  ProjectPublicKpis['statutSante']
> = {
  payee: 'sain',
  a_venir: 'sain',
  retard_leger: 'retard_leger',
  retard_significatif: 'retard_significatif',
  defaut: 'defaut',
  perte_definitive: 'perte',
};

const GRAVITE_SANTE: Record<ProjectPublicKpis['statutSante'], number> = {
  sain: 0,
  retard_leger: 1,
  retard_significatif: 2,
  defaut: 3,
  perte: 4,
};

/** Sous-ensemble du cache réellement consommé ici (ISP). */
interface KpiCache {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/**
 * KPI publics d'un projet — agrégés sur l'ensemble des investisseurs, donc sans
 * donnée nominative. Lecture chaude servie par le cache : l'invalidation est
 * explicite (`invalidate`) et non pilotée par le TTL seul.
 */
@Injectable()
export class ProjectKpiService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: KpiCache,
    @InjectRepository(ProjectEntity)
    private readonly projRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly invRepo: Repository<InvestmentEntity>,
  ) {}

  async getPublicKpis(projetId: string): Promise<ProjectPublicKpis> {
    const cacheKey = `${CACHE_KEY_PREFIX}${projetId}`;
    const cached = await this.cache.get<ProjectPublicKpis>(cacheKey);
    if (cached) return cached;

    const projet = await this.projRepo.findOne({
      where: { id: projetId, statut: Not(ProjectStatus.BROUILLON) },
    });
    // Garde en mémoire en plus du filtre SQL : un brouillon ne fuite jamais,
    // même si l'appelant fournit son propre QueryBuilder un jour.
    if (!projet || projet.statut === ProjectStatus.BROUILLON) {
      throw new NotFoundException('Projet introuvable');
    }

    const investments = await this.invRepo.find({
      where: { projetId, statut: In(STATUTS_ENGAGES) },
      relations: ['echeances'],
    });

    const kpis = this.compute(projet, investments);
    await this.cache.set(cacheKey, kpis, CACHE_TTL_MS);
    return kpis;
  }

  /**
   * Purge la vue cachée d'un projet. Publique et idempotente : à appeler depuis
   * tout chemin qui modifie collecte ou échéancier (investissement confirmé,
   * échéance payée, projet mis à jour).
   */
  async invalidate(payload: { projetId: string }): Promise<void> {
    if (!payload?.projetId) return;
    await this.cache.del(`${CACHE_KEY_PREFIX}${payload.projetId}`);
  }

  private compute(
    projet: ProjectEntity,
    investments: InvestmentEntity[],
  ): ProjectPublicKpis {
    const now = new Date();
    const echeances = investments.flatMap((inv) => inv.echeances ?? []);
    const payees = echeances.filter((e) => !!e.payeLe);
    const futures = echeances.filter((e) => !e.payeLe);

    const capitalCible = Number(projet.capitalCible ?? 0);
    const capitalCollecte = investments.reduce(
      (s, inv) => s + Number(inv.montant),
      0,
    );
    const capitalRembourse = payees.reduce(
      (s, e) => s + Number(e.montantCapital),
      0,
    );
    const capitalRestantDuGlobal = futures.reduce(
      (s, e) => s + Number(e.montantCapital),
      0,
    );
    const interetsVersesTotaux = payees.reduce(
      (s, e) => s + Number(e.montantInterets),
      0,
    );

    const walAnnees = computeWal(
      futures.map((e) => ({
        datePrevue: e.datePrevue,
        montantCapital: Number(e.montantCapital),
      })),
      now,
    );

    const sante = this.deriveSante(futures, now);

    return {
      triCible: Number(projet.triCible ?? 0),
      dureeMois: projet.dureeMois,
      capitalCible,
      instrument: projet.instrument,
      capitalCollecte,
      pctCollecte: capitalCible > 0 ? (capitalCollecte / capitalCible) * 100 : 0,
      nbInvestisseurs: new Set(investments.map((inv) => inv.utilisateurId)).size,
      capitalRestantDuGlobal,
      capitalRembourse,
      pctCapitalRembourse:
        capitalCollecte > 0 ? (capitalRembourse / capitalCollecte) * 100 : 0,
      interetsVersesTotaux,
      walMois: walAnnees !== null ? walAnnees * 12 : null,
      echeancesEnRetard: sante.enRetard,
      echeancesEnDefaut: sante.enDefaut,
      statutSante: sante.statut,
      echeancierPrevisionnel: this.buildEcheancier(echeances, now),
    };
  }

  private deriveSante(
    futures: EcheanceEntity[],
    now: Date,
  ): {
    enRetard: number;
    enDefaut: number;
    statut: ProjectPublicKpis['statutSante'];
  } {
    let enRetard = 0;
    let enDefaut = 0;
    let statut: ProjectPublicKpis['statutSante'] = 'sain';

    for (const e of futures) {
      const calcule = deriveEcheanceStatus(
        { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
        now,
      );
      const ligne = LIGNE_PAR_STATUT[calcule];
      if (ligne === 'retard') enRetard++;
      if (ligne === 'defaut') enDefaut++;

      const candidat = SANTE_PAR_STATUT[calcule];
      if (GRAVITE_SANTE[candidat] > GRAVITE_SANTE[statut]) statut = candidat;
    }

    return { enRetard, enDefaut, statut };
  }

  /**
   * Échéancier vu côté projet : les échéances de tous les investisseurs sont
   * agrégées par numéro. Le statut retenu pour une ligne est le plus grave de
   * ses composantes.
   */
  private buildEcheancier(
    echeances: EcheanceEntity[],
    now: Date,
  ): ProjectEcheanceLine[] {
    const parNumero = new Map<number, ProjectEcheanceLine>();

    for (const e of echeances) {
      const statut =
        LIGNE_PAR_STATUT[
          deriveEcheanceStatus(
            { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
            now,
          )
        ];
      const existante = parNumero.get(e.numero);

      if (!existante) {
        parNumero.set(e.numero, {
          numero: e.numero,
          datePrevue: e.datePrevue,
          montantCapital: Number(e.montantCapital),
          montantInterets: Number(e.montantInterets),
          montantTotal: Number(e.montantTotal),
          statut,
        });
        continue;
      }

      existante.montantCapital += Number(e.montantCapital);
      existante.montantInterets += Number(e.montantInterets);
      existante.montantTotal += Number(e.montantTotal);
      if (GRAVITE_LIGNE[statut] > GRAVITE_LIGNE[existante.statut]) {
        existante.statut = statut;
      }
    }

    return [...parNumero.values()].sort((a, b) => a.numero - b.numero);
  }
}
