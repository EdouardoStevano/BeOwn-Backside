import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { VerrouCronService } from 'src/common/cron/verrou-cron.service';
import { formatEur } from 'src/shared/money/format-eur';

/**
 * Délai au-delà duquel une marque d'intérêt sans réponse est caduque.
 *
 * 72 h par défaut, réglable par `SECONDARY_INTEREST_TTL_HOURS`. Le vendeur a
 * trois jours pleins pour accepter ou refuser ; passé ce délai, laisser
 * l'annonce hors du carnet ne sert plus personne.
 */
export const delaiInteretMs = (env: NodeJS.ProcessEnv = process.env): number => {
  const heures = Number(env.SECONDARY_INTEREST_TTL_HOURS);
  const retenu = Number.isFinite(heures) && heures > 0 ? heures : 72;
  return retenu * 60 * 60 * 1000;
};

/** Nombre d'annonces examinées par passage — borne la charge d'un balayage. */
const TAILLE_LOT = 200;

/** Nom du verrou distribué de cette tâche. */
const NOM_VERROU = 'secondaire:interets-expires';

/**
 * Expiration des marques d'intérêt restées sans réponse.
 *
 * LE TROU QUE CE BALAYAGE REFERME — une marque d'intérêt sort l'annonce du
 * carnet (`INTERET_EXPRIME`) en attendant la réponse du vendeur. Si celui-ci
 * ne répond jamais, RIEN ne se passait : l'annonce restait indéfiniment
 * invisible des autres acheteurs, et l'acheteur qui s'était manifesté n'était
 * ni servi ni informé. Deux personnes bloquées par une absence de décision,
 * sans terme.
 *
 * Les fonds ne sont PAS concernés : ils ne sont réservés qu'à l'acceptation
 * (`CessionCompensationService.reserverFonds`). Une marque d'intérêt
 * n'engage rien — c'est précisément ce qui la distingue d'une acceptation, et
 * ce que l'article 25 impose. Il n'y a donc rien à libérer côté argent : ce
 * balayage rend l'ANNONCE, et prévient les deux parties.
 *
 * VERROU DISTRIBUÉ — `@Cron` s'exécute dans chaque réplique. Sans lui, six
 * pods balaieraient les mêmes annonces à la même seconde. La transition étant
 * conditionnelle, aucune double expiration n'était possible, mais le travail
 * était fait six fois et les notifications partaient en double.
 */
@Injectable()
export class InteretsExpiryCronService {
  private readonly logger = new Logger(InteretsExpiryCronService.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    private readonly notifications: NotificationService,
    // Optionnel : plusieurs suites construisent ce service à la main, et un
    // balayage ne doit pas échouer faute de verrou — sans lui, on exécute,
    // comme avant.
    @Optional() private readonly verrou?: VerrouCronService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expirerInteretsSansReponse(
    maintenant: Date = new Date(),
  ): Promise<number> {
    if (!this.verrou) return this.balayer(maintenant);
    const resultat = await this.verrou.executerSiSeul(NOM_VERROU, () =>
      this.balayer(maintenant),
    );
    return resultat ?? 0;
  }

  private async balayer(maintenant: Date): Promise<number> {
    const limite = new Date(maintenant.getTime() - delaiInteretMs());

    const candidats = await this.ordreRepo.find({
      where: {
        statut: OrdreMarcheStatus.INTERET_EXPRIME,
        interetExprimeLe: LessThanOrEqual(limite),
      },
      take: TAILLE_LOT,
    });
    if (candidats.length === 0) {
      this.logger.debug(
        'CRON intérêts-expirés : aucune marque d’intérêt hors délai.',
      );
      return 0;
    }

    let expires = 0;
    for (const ordre of candidats) {
      try {
        if (await this.expirerUneAnnonce(ordre)) expires += 1;
      } catch (erreur: unknown) {
        // Un échec isolé ne doit pas arrêter le balayage : les annonces
        // suivantes sont indépendantes.
        this.logger.error(
          `CRON intérêts-expirés : échec sur l'annonce ${ordre.id} : ${
            erreur instanceof Error ? erreur.message : String(erreur)
          }`,
        );
      }
    }

    this.logger.log(
      `CRON intérêts-expirés : ${expires}/${candidats.length} marque(s) d'intérêt expirée(s).`,
    );
    return expires;
  }

  /**
   * Remet UNE annonce au carnet, purgée de sa marque d'intérêt.
   *
   * Transition CONDITIONNELLE sur `INTERET_EXPRIME` : une annonce que le
   * vendeur vient d'accepter, ou qu'un autre chemin a déjà traitée, n'est
   * jamais rétrogradée.
   */
  private async expirerUneAnnonce(
    ordre: OrdreMarcheEntity,
  ): Promise<boolean> {
    const acheteurId = ordre.acheteurId;
    const nbFractions = ordre.interetNbFractions;

    const transition = await this.ordreRepo
      .createQueryBuilder()
      .update(OrdreMarcheEntity)
      .set({
        statut: OrdreMarcheStatus.EN_CARNET,
        acheteurId: null,
        interetNbFractions: null,
        interetExprimeLe: null,
      })
      .where('id = :id AND statut = :attendu', {
        id: ordre.id,
        attendu: OrdreMarcheStatus.INTERET_EXPRIME,
      })
      .execute();

    if (!transition.affected) return false;

    const montantIndicatif =
      Math.round(Number(ordre.prixUnitaire) * Number(nbFractions ?? 0) * 100) /
      100;

    // LES DEUX PARTIES sont prévenues. Le vendeur, parce que son annonce
    // vient de changer d'état sans qu'il ait rien fait ; l'acheteur, parce
    // que sa manifestation d'intérêt est restée sans réponse et qu'il doit
    // pouvoir se manifester ailleurs plutôt qu'attendre indéfiniment.
    await this.notifications
      .push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Marque d’intérêt expirée — annonce republiée',
        message:
          "Une marque d'intérêt sur votre annonce est restée sans réponse et a " +
          'expiré. Votre annonce est de nouveau visible au carnet.',
        metadata: { ordreId: ordre.id },
      })
      .catch(() => undefined);

    if (acheteurId != null) {
      await this.notifications
        .push({
          utilisateurId: acheteurId,
          type: NotificationType.MARCHE_SECONDAIRE,
          titre: 'Votre marque d’intérêt a expiré',
          message:
            `Votre intérêt pour ${nbFractions ?? 0} fraction(s) ` +
            `(${formatEur(montantIndicatif)}) est resté sans réponse du vendeur et a expiré. ` +
            "Aucun montant n'avait été engagé — l'annonce est de nouveau ouverte si vous " +
            'souhaitez vous manifester à nouveau.',
          metadata: { ordreId: ordre.id, nbFractions },
        })
        .catch(() => undefined);
    }

    return true;
  }
}
