import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { CreateInvestmentUseCase } from '../usecases/create-investment.usecase';
import { CreateInvestmentDto } from 'src/investments/presenters/dto/investment.dto';

/** Le strict nécessaire d'une part de distribution payée. */
export interface PartPayee {
  partId: string;
  utilisateurId: number;
  montantNetEur: number;
}

/**
 * Réinvestissement automatique des loyers (vague C — benchmark : la feature
 * « intérêts composés », DRIP de Fundrise, option Corum).
 *
 * OPT-IN STRICT : `user_preferences.reinvestLoyers` + un projet cible choisi.
 * À chaque part de distribution payée, le net crédité est converti en
 * fractions ENTIÈRES du projet cible s'il est `en_collecte` — le reliquat
 * reste au wallet, on n'emprunte jamais sur un solde antérieur au-delà du
 * net de la part (le loyer réinvesti est CELUI qui vient d'arriver, pas
 * l'épargne accumulée : c'est le contrat annoncé à l'écran de préférences).
 *
 * LA SOUSCRIPTION PASSE PAR CreateInvestmentUseCase — jamais un chemin
 * parallèle : gardes KYC, art. 21(7), plafonds de collecte, atomicité et
 * grand livre s'appliquent à l'identique d'une souscription manuelle. La clé
 * d'idempotence dérivée de la part (`reinvest:<partId>`, déterministe) rend
 * tout rejeu de distribution sans effet.
 *
 * NON-BLOQUANT INTÉGRAL : une distribution ne doit JAMAIS échouer ni être
 * retardée parce qu'un réinvestissement est refusé (KYC expiré, seuil
 * art. 21, collecte pleine, net insuffisant…). Tout refus se journalise et
 * notifie l'investisseur avec son motif — l'argent, lui, est déjà au wallet.
 */
@Injectable()
export class ReinvestirLoyersService {
  private readonly logger = new Logger(ReinvestirLoyersService.name);

  constructor(
    @InjectRepository(UserPreferencesEntity)
    private readonly preferences: Repository<UserPreferencesEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projets: Repository<ProjectEntity>,
    private readonly createInvestment: CreateInvestmentUseCase,
    private readonly notifications: NotificationService,
  ) {}

  /** Best-effort : n'échoue jamais chez l'appelant (la distribution). */
  async surPartPayee(part: PartPayee): Promise<void> {
    try {
      await this.reinvestir(part);
    } catch (err) {
      this.logger.error(
        `Réinvestissement échoué (part ${part.partId}, user ${part.utilisateurId}) — ` +
          `la distribution n'est PAS affectée : ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }
  }

  private async reinvestir(part: PartPayee): Promise<void> {
    const prefs = await this.preferences.findOne({
      where: { userId: part.utilisateurId },
    });
    if (!prefs?.reinvestLoyers || !prefs.reinvestProjetId) return;

    const projet = await this.projets.findOne({
      where: { id: prefs.reinvestProjetId },
      select: ['id', 'titre', 'statut', 'prixFraction'],
    });
    const prixFraction = Number(projet?.prixFraction ?? 0);

    if (!projet || projet.statut !== ProjectStatus.EN_COLLECTE || prixFraction <= 0) {
      await this.notifierSansEchouer(
        part.utilisateurId,
        `Vos loyers n'ont pas été réinvestis : le projet cible n'est plus en collecte. ` +
          `Le montant reste disponible sur votre portefeuille — choisissez une nouvelle cible dans vos préférences.`,
      );
      return;
    }

    const nbFractions = Math.floor(part.montantNetEur / prixFraction);
    if (nbFractions < 1) {
      // Net insuffisant pour une fraction entière : silencieux — notifier
      // chaque mois « pas assez pour réinvestir » serait du harcèlement.
      return;
    }

    try {
      const investissement = await this.createInvestment.execute(
        part.utilisateurId,
        Object.assign(new CreateInvestmentDto(), {
          projetId: projet.id,
          nbFractions,
          // Déterministe : le rejeu d'une distribution retombe sur la même
          // clé et CreateInvestmentUseCase renvoie l'opération existante.
          idempotencyKey: `reinvest:${part.partId}`,
        }),
      );
      await this.notifierSansEchouer(
        part.utilisateurId,
        `Loyers réinvestis automatiquement : ${nbFractions} fraction(s) de « ${projet.titre} » ` +
          `(${(nbFractions * prixFraction).toFixed(2)} €). Le reliquat reste sur votre portefeuille.`,
      );
      this.logger.log(
        `Réinvestissement exécuté : user ${part.utilisateurId}, part ${part.partId} → ` +
          `investissement ${investissement.id} (${nbFractions} fractions)`,
      );
    } catch (err) {
      // Refus MÉTIER (KYC, art. 21, plafond…) : l'utilisateur doit savoir
      // pourquoi son opt-in n'a pas produit d'investissement.
      const motif = err instanceof Error ? err.message : String(err);
      await this.notifierSansEchouer(
        part.utilisateurId,
        `Vos loyers n'ont pas pu être réinvestis automatiquement : ${motif} ` +
          `Le montant reste disponible sur votre portefeuille.`,
      );
      this.logger.warn(
        `Réinvestissement refusé (part ${part.partId}, user ${part.utilisateurId}) : ${motif}`,
      );
    }
  }

  private async notifierSansEchouer(userId: number, message: string): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.INVESTISSEMENT,
        titre: 'Réinvestissement automatique',
        message,
        metadata: { kind: 'reinvest_loyers' },
      });
    } catch (err) {
      this.logger.warn(
        `Notification de réinvestissement non envoyée (user ${userId}) : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
