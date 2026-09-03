import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { CessionCompensationService } from 'src/secondarymarket/applications/cession-compensation.service';

export type ResultatExpiration = 'expiree' | 'noop';

/**
 * Expiration d'une signature de cession non recueillie dans les 48 h.
 *
 * Séquence unique, appelée par DEUX chemins indépendants :
 *  - le webhook `signature_request.expired` du prestataire ;
 *  - le cron de sécurité, qui balaie les signatures échues sans attendre un
 *    événement externe (un webhook non reçu — panne, abonnement expiré,
 *    endpoint désabonné — laissait sinon l'annonce et les fonds gelés à vie).
 *
 * La transition `PENDING → EXPIRED` est CONDITIONNELLE : c'est elle qui rend
 * la séquence single-shot. Que les deux chemins se déclenchent en même temps ne
 * libère jamais les fonds deux fois.
 */
@Injectable()
export class ExpirerSignatureCessionUseCase {
  private readonly logger = new Logger(ExpirerSignatureCessionUseCase.name);

  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    private readonly compensation: CessionCompensationService,
    private readonly notifications: NotificationService,
  ) {}

  /** Entrée du webhook prestataire : la signature est désignée par son id externe. */
  async parRequeteFournisseur(youSignRequestId: string): Promise<ResultatExpiration> {
    const signature = await this.signatureRepo.findOne({
      where: { youSignRequestId },
    });
    if (!signature) return 'noop';
    return this.execute(signature);
  }

  async execute(signature: SignatureEntity): Promise<ResultatExpiration> {
    const expiration = await this.signatureRepo
      .createQueryBuilder()
      .update(SignatureEntity)
      .set({ statut: SignatureStatus.EXPIRED })
      .where('id = :id AND statut = :pending', {
        id: signature.id,
        pending: SignatureStatus.PENDING,
      })
      .execute();
    if (!expiration.affected) return 'noop';

    // Une signature expirée laissait l'annonce coincée en `accepte` — hors du
    // carnet, sans signataire — et les fonds de l'acheteur bloqués. On rend les
    // deux : sans cela l'annonce était perdue pour son vendeur et l'argent de
    // l'acheteur immobilisé sans terme.
    const { statutOrdre } = await this.compensation.compenserCessionInaboutie({
      ordreId: signature.ordreId,
      acheteurId: signature.userId,
      nbFractions: signature.nbFractions,
    });

    await this.prevenirAcheteur(signature);
    await this.prevenirVendeur(signature, statutOrdre);

    this.logger.log(
      `Signature ${signature.id} expirée (ordre=${signature.ordreId ?? 'aucun'}, ` +
        `statutOrdre=${statutOrdre ?? 'inchangé'})`,
    );
    return 'expiree';
  }

  private async prevenirAcheteur(signature: SignatureEntity): Promise<void> {
    const avecFonds = signature.ordreId != null;
    await this.notifications
      .push({
        utilisateurId: signature.userId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Signature expirée',
        message: avecFonds
          ? "Votre contrat de cession a expiré faute de signature sous 48 h. Les fonds " +
            'réservés sont de nouveau disponibles sur votre portefeuille et la cession ' +
            "n'a pas eu lieu."
          : 'Votre contrat a expiré faute de signature sous 48 h.',
        metadata: { ordreId: signature.ordreId, signatureId: signature.id },
      })
      .catch(() => {});
  }

  /** Le vendeur attendait une signature : il doit savoir qu'elle n'arrivera pas. */
  private async prevenirVendeur(
    signature: SignatureEntity,
    statutOrdre: OrdreMarcheStatus | null,
  ): Promise<void> {
    if (!signature.ordreId || !statutOrdre) return;
    const ordre = await this.ordreRepo.findOne({ where: { id: signature.ordreId } });
    if (!ordre) return;

    await this.notifications
      .push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "L'acheteur n'a pas signé dans les délais",
        message:
          statutOrdre === OrdreMarcheStatus.EN_CARNET
            ? "Faute de signature sous 48 h, la cession n'a pas eu lieu. Votre annonce est " +
              "republiée sur le tableau d'affichage."
            : "Faute de signature sous 48 h, la cession n'a pas eu lieu. La marque d'intérêt " +
              "vous est de nouveau soumise : vous pouvez l'accepter à nouveau ou la refuser.",
        metadata: { ordreId: ordre.id, statut: statutOrdre },
      })
      .catch(() => {});
  }
}
