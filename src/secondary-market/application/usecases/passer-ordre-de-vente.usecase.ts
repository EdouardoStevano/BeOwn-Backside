import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { OrdreMarcheOrmMapper } from 'src/secondary-market/infrastructure/persistence/mappers/ordre-marche.orm-mapper';
import { CapaciteDeCession } from 'src/secondary-market/domain/aggregates/capacite-de-cession';
import { SecondaryMarketOrder } from 'src/secondary-market/domain/aggregates/secondary-market-order';
import {
  OrdreMarcheSens,
  OrdreMarcheStatus,
} from 'src/secondary-market/domain/enums/ordre-marche.enum';
import {
  InvestissementIntrouvableError,
  InvestissementNonDetenuError,
} from 'src/secondary-market/domain/errors';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

/** Ce qu'il faut pour mettre des fractions au carnet. */
export interface OrdreDeVenteDemande {
  investissementId: string;
  sens: OrdreMarcheSens;
  nbFractions: number;
  prixUnitaire: number;
  valideJusquAu?: string;
}

/**
 * **Passer un ordre de vente** — un porteur offre au carnet tout ou partie des
 * fractions qu'il détient sur un investissement.
 *
 * Le use case orchestre, il ne décide pas (§14). Trois règles qui vivaient
 * dans `SecondaryMarketController.createOrder` sont rendues à leurs
 * propriétaires : la détention des fractions et la validité de l'annonce à
 * {@link SecondaryMarketOrder}, l'anti-double-mise-en-vente à
 * {@link CapaciteDeCession}. Ce qui reste ici est ce qu'un use case doit
 * faire : ouvrir la transaction, poser le verrou, persister, notifier.
 *
 * Le verrou pessimiste sur la ligne investissement est inchangé, et il est
 * essentiel : c'est lui qui sérialise deux annonces concurrentes sur le même
 * investissement. L'agrégat dit si l'inscription est légitime ; le verrou
 * garantit que deux inscriptions ne se croisent pas entre la lecture et
 * l'écriture.
 */
@Injectable()
export class PasserOrdreDeVenteUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(
    demande: OrdreDeVenteDemande,
    vendeurId: number,
  ): Promise<OrdreMarcheEntity> {
    const saved = await this.dataSource.transaction(async (em) => {
      const investment = await em
        .createQueryBuilder(InvestmentEntity, 'inv')
        .setLock('pessimistic_write')
        .where('inv.id = :id', { id: demande.investissementId })
        .getOne();
      if (!investment) {
        throw new InvestissementIntrouvableError(demande.investissementId);
      }
      if (investment.utilisateurId !== vendeurId) {
        throw new InvestissementNonDetenuError();
      }

      // Le recompte est sérialisé par le verrou acquis ci-dessus.
      const ordresActifs = await em.find(OrdreMarcheEntity, {
        where: {
          investissementId: demande.investissementId,
          statut: OrdreMarcheStatus.EN_CARNET,
        },
      });
      const capacite = CapaciteDeCession.reconstituer({
        investissementId: demande.investissementId,
        fractionsDetenues: Number(investment.nbTitres ?? 0),
        fractionsDejaEnCarnet: ordresActifs.reduce(
          (somme, o) => somme + Number(o.nbFractions),
          0,
        ),
      });
      capacite.inscrire(demande.nbFractions);

      const naissant = SecondaryMarketOrder.passer({
        investissementId: demande.investissementId,
        vendeurId,
        sens: demande.sens,
        nbFractions: demande.nbFractions,
        prixUnitaire: demande.prixUnitaire,
        valideJusquAu: demande.valideJusquAu
          ? new Date(demande.valideJusquAu)
          : null,
      });

      return em.save(
        OrdreMarcheEntity,
        OrdreMarcheOrmMapper.naissantToEntity(naissant),
      );
    });

    // ── Effet de bord APRÈS commit (non bloquant pour la mise au carnet) ─────
    const investment = await this.investRepo.findOne({
      where: { id: demande.investissementId },
    });
    const [project, vendeur] = await Promise.all([
      investment
        ? this.projectRepo.findOne({ where: { id: investment.projetId } })
        : null,
      this.userRepo.findOne({ where: { userId: vendeurId } }),
    ]);
    if (project && vendeur) {
      this.notificationEvents.secondaryOrderCreated(saved, project, vendeur);
    }

    return saved;
  }
}
