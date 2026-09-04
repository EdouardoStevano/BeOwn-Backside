import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import {
  EcheanceStatus,
  InvestmentStatus,
} from 'src/investments/domains/enums/investment-status.enum';
import {
  PublicationTauxDefaut,
  construirePublication,
  debutPeriodePublication,
} from 'src/kpi/domains/taux-defaut-publication';

/**
 * Assemble la publication annuelle des taux de défaut — art. 20 du règlement
 * (UE) 2020/1503.
 *
 * Ce service ne calcule rien : il lit les projets financés de la fenêtre, en
 * déduit deux faits par projet (défaut constaté, perte définitive) et confie
 * l'agrégation au domaine.
 *
 * CACHE 1 h EN MÉMOIRE DE PROCESSUS — même entorse assumée et documentée que
 * `PublicStatisticsService`, pour la même raison, en plus marquée ici : la
 * route qui l'expose est PUBLIQUE et non authentifiée, et un calcul coûte une
 * lecture des projets de la fenêtre PUIS deux lectures par projet. Sans cache,
 * chaque appel anonyme déclenchait cette rafale — une route publique qui
 * amplifie le trafic en charge de base est un levier de déni de service
 * gratuit. La donnée est publique, identique pour tous, et bouge à l'échelle
 * du trimestre : la perdre au redémarrage coûte un recalcul, et la divergence
 * entre réplicas est bornée à une heure sur une statistique à 36 mois.
 */
@Injectable()
export class TauxDefautPublicationService {
  private readonly logger = new Logger(TauxDefautPublicationService.name);

  /** Statuts d'échéance qui caractérisent un projet en défaut. */
  private static readonly STATUTS_DEFAUT: EcheanceStatus[] = [
    EcheanceStatus.DEFAUT,
    EcheanceStatus.PERTE_DEFINITIVE,
  ];

  private static readonly TTL_MS = 3_600_000;
  private cache: { calculeA: number; valeur: PublicationTauxDefaut } | null =
    null;

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  /**
   * Publication à la date du jour, servie depuis le cache tant qu'il est
   * frais. Une date de référence EXPLICITE (rejeu, contrôle, test) court-
   * circuite le cache : elle désigne un autre calcul, qui n'a rien à faire
   * dans l'entrée du calcul courant.
   */
  async publier(reference?: Date): Promise<PublicationTauxDefaut> {
    if (reference) return this.calculer(reference);

    const maintenant = Date.now();
    if (
      this.cache &&
      maintenant - this.cache.calculeA < TauxDefautPublicationService.TTL_MS
    ) {
      return this.cache.valeur;
    }

    const valeur = await this.calculer(new Date());
    this.cache = { calculeA: maintenant, valeur };
    return valeur;
  }

  private async calculer(reference: Date): Promise<PublicationTauxDefaut> {
    const debut = debutPeriodePublication(reference);

    // Seuls les projets dont la collecte a abouti entrent dans la statistique :
    // un projet encore en collecte n'a pas pu faire défaut.
    const projets = await this.projectRepo.find({
      where: {
        dateOuvertureCollecte: MoreThanOrEqual(debut),
        statut: In([
          ProjectStatus.FINANCE,
          ProjectStatus.EN_EXPLOITATION,
          ProjectStatus.CLOTURE,
        ]),
      },
    });

    if (projets.length === 0) {
      return construirePublication([], reference);
    }

    const observes = await Promise.all(
      projets.map(async (projet) => {
        const investissements = await this.investRepo.find({
          where: {
            projetId: projet.id,
            statut: In([
              InvestmentStatus.CONFIRME,
              InvestmentStatus.REMBOURSE_CAPITAL,
              InvestmentStatus.REMBOURSE_TOTAL,
            ]),
          },
          select: ['id', 'montant'],
        });

        const capitalCollecte = investissements.reduce(
          (total, inv) => total + Number(inv.montant),
          0,
        );

        const ids = investissements.map((inv) => inv.id);
        const echeances = ids.length
          ? await this.echeanceRepo.find({
              where: {
                investissementId: In(ids),
                statut: In(TauxDefautPublicationService.STATUTS_DEFAUT),
              },
              select: ['statut', 'montantCapital'],
            })
          : [];

        return {
          projetId: projet.id,
          ouvertLe: projet.dateOuvertureCollecte as Date,
          capitalCollecte,
          enDefaut: echeances.length > 0,
          capitalPerteDefinitive: echeances
            .filter((e) => e.statut === EcheanceStatus.PERTE_DEFINITIVE)
            .reduce((total, e) => total + Number(e.montantCapital), 0),
        };
      }),
    );

    const publication = construirePublication(observes, reference);
    this.logger.log(
      `Publication taux de défaut : ${publication.global.nbProjets} projet(s), ` +
        `${publication.global.tauxDefautProjets} % de défaut sur ${publication.profondeurMois} mois`,
    );
    return publication;
  }
}
