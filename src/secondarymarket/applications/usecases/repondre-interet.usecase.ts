import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { jourLimiteValidite } from 'src/secondarymarket/domains/tableau-affichage';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InitiateBuyUseCase } from './initiate-buy.usecase';
import { estIndisponibiliteFournisseur } from 'src/common/yousign/signature-provider.error';
import { CessionCompensationService } from 'src/secondarymarket/applications/cession-compensation.service';
import { formatEur } from 'src/shared/money/format-eur';
import { ConflitsInteretsService } from 'src/projects/applications/conflits-interets.service';

/**
 * Réponse du vendeur à une marque d'intérêt — art. 25 du règlement
 * (UE) 2020/1503.
 *
 * C'est ici, et nulle part ailleurs, que naît le contrat. Tant que le vendeur
 * n'a pas accepté, l'acheteur n'a qu'exprimé un intérêt : la plateforme n'a
 * rapproché aucune volonté. L'acceptation déclenche la génération du contrat
 * de cession et le parcours de signature.
 *
 * Le refus remet l'annonce en circulation, sans que la plateforme reclasse ou
 * réattribue quoi que ce soit.
 */
@Injectable()
export class RepondreInteretUseCase {
  private readonly logger = new Logger(RepondreInteretUseCase.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    private readonly initiateBuy: InitiateBuyUseCase,
    private readonly notifications: NotificationService,
    private readonly compensation: CessionCompensationService,
    // Conflits d'intérêts (décision D5) — en queue de constructeur.
    private readonly conflitsInterets: ConflitsInteretsService,
  ) {}

  async accepter(
    ordreId: string,
    vendeurId: number,
  ): Promise<{ ordreId: string; signingUrl: string; signatureId: string }> {
    const ordre = await this.chargerPourVendeur(ordreId, vendeurId);
    const acheteurId = ordre.acheteurId;
    const nbFractions = ordre.interetNbFractions;

    if (!acheteurId || !nbFractions) {
      throw new BadRequestException(
        "Aucune marque d'intérêt exploitable sur cette annonce.",
      );
    }

    // ÉCHÉANCE REVÉRIFIÉE AU MOMENT DE L'ACCEPTATION.
    //
    // La date de validité n'était contrôlée qu'à l'affichage du carnet : une
    // annonce échue entre l'expression d'intérêt et la réponse du vendeur
    // pouvait encore être acceptée, et la cession se formait sur une offre que
    // son auteur avait explicitement bornée dans le temps. Le vendeur a fixé
    // cette limite ; elle vaut jusqu'à la formation du contrat, pas seulement
    // jusqu'à l'affichage.
    // `valideJusquAu` est une colonne `date` : TypeORM la rend tantôt en Date,
    // tantôt en chaîne `YYYY-MM-DD` selon le driver. La comparaison se fait
    // donc sur la forme normalisée, la même que celle du carnet.
    const jourValidite =
      ordre.valideJusquAu instanceof Date
        ? jourLimiteValidite(ordre.valideJusquAu)
        : (ordre.valideJusquAu as string | null);

    if (jourValidite && jourValidite < jourLimiteValidite(new Date())) {
      throw new BadRequestException(
        "Cette annonce a expiré : sa date de validité est dépassée. " +
          'Republiez-la pour accepter une nouvelle marque d’intérêt.',
      );
    }

    // ── Conflits d'intérêts (décision D5) ────────────────────────────────────
    // La garde porte sur l'ACHETEUR, pas sur le vendeur qui répond : c'est lui
    // qui acquiert les parts et qui sera débité. Elle est rejouée ici, et pas
    // seulement à l'expression d'intérêt, parce que le porteur d'un projet peut
    // l'être devenu ENTRE les deux : rien ne doit se former sur un conflit né
    // dans l'intervalle. Elle passe avant la réservation des fonds, pour ne
    // bloquer aucun euro sur une cession qui ne peut pas aboutir.
    await this.conflitsInterets.assertPasPorteurDuProjetCede(
      acheteurId,
      ordre.investissementId,
    );

    const claim = await this.ordreRepo
      .createQueryBuilder()
      .update(OrdreMarcheEntity)
      .set({ statut: OrdreMarcheStatus.ACCEPTE, accepteLe: () => 'NOW()' })
      .where('id = :id AND statut = :enAttente', {
        id: ordreId,
        enAttente: OrdreMarcheStatus.INTERET_EXPRIME,
      })
      .execute();
    if (!claim.affected) {
      throw new BadRequestException('Cette marque d\'intérêt a déjà reçu une réponse.');
    }

    this.logger.log(
      `Annonce ${ordreId} acceptée par le vendeur ${vendeurId} au profit de ${acheteurId}`,
    );

    // La rencontre des volontés est acquise : le parcours contractuel peut
    // s'exécuter. `InitiateBuyUseCase` n'est jamais appelé en dehors d'ici.
    //
    // Deux gestes indissociables, dans cet ordre :
    //  1. RÉSERVER les fonds de l'acheteur. Le vendeur s'engage ici et
    //     maintenant ; laisser le solde de l'acheteur disponible pendant les
    //     48 h de signature, c'est accepter qu'il le retire ou le réinvestisse
    //     et que le règlement échoue après coup, sur un engagement déjà pris.
    //  2. Ouvrir le parcours de signature.
    //
    // Si l'une des deux échoue (solde parti entre-temps, génération du contrat,
    // stockage, prestataire de signature), l'annonce ne doit pas rester coincée
    // en ACCEPTE et les fonds ne doivent pas rester bloqués : ni le vendeur ni
    // l'acheteur n'auraient alors de porte de sortie. On défait tout et on
    // ramène l'annonce à l'état antérieur, qui laisse au vendeur le choix de
    // réessayer ou de refuser.
    const montantCession = CessionCompensationService.montantCession(
      ordre.prixUnitaire,
      nbFractions,
    );
    let fondsReserves = false;
    let initiation: { signingUrl: string; signatureId: string };
    try {
      await this.compensation.reserverFonds(acheteurId, montantCession);
      fondsReserves = true;
      initiation = await this.initiateBuy.execute(
        ordreId,
        acheteurId,
        nbFractions,
      );
    } catch (err) {
      if (fondsReserves) {
        await this.compensation
          .libererFonds(acheteurId, montantCession)
          .catch((echec: unknown) =>
            this.logger.error(
              `Fonds réservés NON libérés pour l'acheteur ${acheteurId} sur l'annonce ${ordreId} ` +
                `(${formatEur(montantCession)}) : ${echec instanceof Error ? echec.message : String(echec)}`,
            ),
          );
      }
      await this.ordreRepo
        .createQueryBuilder()
        .update(OrdreMarcheEntity)
        .set({ statut: OrdreMarcheStatus.INTERET_EXPRIME })
        .where('id = :id AND statut = :accepte', {
          id: ordreId,
          accepte: OrdreMarcheStatus.ACCEPTE,
        })
        .execute();
      this.logger.error(
        `Initiation de cession impossible sur l'annonce ${ordreId} : ` +
          `statut ramené à ${OrdreMarcheStatus.INTERET_EXPRIME}` +
          (estIndisponibiliteFournisseur(err)
            ? ` — prestataire de signature indisponible (${err.motif})`
            : ''),
      );
      // L'erreur repart telle quelle : c'est la couche HTTP qui décide du
      // statut, et elle sait distinguer une panne prestataire d'un bug.
      throw err;
    }

    // Prévenir APRÈS coup, et seulement là : une acceptation compensée n'a RIEN
    // produit, l'annoncer serait un mensonge — l'acheteur recevrait « le
    // vendeur a accepté » pour un contrat qui n'existe pas, sur une annonce
    // simplement revenue en attente de réponse.
    //
    // La partie DÉBITÉE est l'ACHETEUR : c'est donc lui, et lui seul, qui reçoit
    // le lien de signature. Le vendeur, qui a déjà donné son accord ici, n'a
    // plus rien à signer — le lui présenter revenait à lui faire signer le
    // contrat de l'autre partie.
    //
    // L'échec d'une notification ne remet pas en cause une cession déjà
    // initiée : il est journalisé, pas propagé.
    await this.prevenir(
      {
        utilisateurId: acheteurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Signez votre contrat de cession',
        message:
          `Le vendeur a accepté votre marque d'intérêt sur ${nbFractions} fraction(s) ` +
          `(${formatEur(montantCession)}). Ce montant est réservé sur votre portefeuille ` +
          'jusqu\'à votre signature, à recueillir sous 48 h.',
        metadata: {
          ordreId,
          signatureId: initiation.signatureId,
          signingUrl: initiation.signingUrl,
        },
      },
      ordreId,
    );

    await this.prevenir(
      {
        utilisateurId: vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "En attente de la signature de l'acheteur",
        message:
          `Votre acceptation est enregistrée. L'acheteur doit maintenant signer le contrat ` +
          `de cession de ${nbFractions} fraction(s) ; la vente sera effective dès sa signature. ` +
          "Sans signature sous 48 h, l'annonce vous revient.",
        metadata: { ordreId, nbFractions },
      },
      ordreId,
    );

    return { ordreId, ...initiation };
  }

  /** Notification best-effort : journalisée si elle échoue, jamais propagée. */
  private async prevenir(
    options: Parameters<NotificationService['push']>[0],
    ordreId: string,
  ): Promise<void> {
    try {
      await this.notifications.push(options);
    } catch (err: unknown) {
      this.logger.warn(
        `Notification non remise à l'utilisateur ${options.utilisateurId} ` +
          `sur l'annonce ${ordreId} : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async refuser(
    ordreId: string,
    vendeurId: number,
  ): Promise<{ ordreId: string; statut: OrdreMarcheStatus }> {
    const ordre = await this.chargerPourVendeur(ordreId, vendeurId);
    const acheteurId = ordre.acheteurId;

    const claim = await this.ordreRepo
      .createQueryBuilder()
      .update(OrdreMarcheEntity)
      .set({
        statut: OrdreMarcheStatus.EN_CARNET,
        acheteurId: null,
        interetNbFractions: null,
        interetExprimeLe: null,
      })
      .where('id = :id AND statut = :enAttente', {
        id: ordreId,
        enAttente: OrdreMarcheStatus.INTERET_EXPRIME,
      })
      .execute();
    if (!claim.affected) {
      throw new BadRequestException('Cette marque d\'intérêt a déjà reçu une réponse.');
    }

    if (acheteurId) {
      await this.notifications.push({
        utilisateurId: acheteurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Votre marque d\'intérêt n\'a pas été retenue',
        message:
          "Le vendeur n'a pas donné suite. L'annonce reste consultable si vous " +
          'souhaitez vous manifester à nouveau.',
      });
    }

    return { ordreId, statut: OrdreMarcheStatus.EN_CARNET };
  }

  private async chargerPourVendeur(
    ordreId: string,
    vendeurId: number,
  ): Promise<OrdreMarcheEntity> {
    const ordre = await this.ordreRepo.findOne({ where: { id: ordreId } });
    if (!ordre) throw new NotFoundException('Annonce introuvable');
    if (ordre.vendeurId !== vendeurId) {
      throw new ForbiddenException(
        'Seul le vendeur peut répondre à une marque d\'intérêt sur son annonce.',
      );
    }
    if (ordre.statut !== OrdreMarcheStatus.INTERET_EXPRIME) {
      throw new BadRequestException(
        "Cette annonce n'est pas en attente d'une réponse du vendeur.",
      );
    }
    return ordre;
  }
}
