import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/compliance/domain/repositories/dossier-de-pieces.repository';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/compliance/domain/repositories/profil-pm.repository';
import { ProfilPMIntrouvableError } from 'src/compliance/domain/errors';
import { PieceJustificativeRefuseeDomainEvent } from 'src/compliance/domain/events/piece-justificative-refusee.domain-event';
import { PieceJustificativeSnapshot } from 'src/compliance/domain/entities/piece-justificative';

/**
 * Instruction d'une pièce justificative par l'équipe conformité.
 *
 * **C'est le maillon que le cahier des charges confie au PSP** — « les documents
 * sont automatiquement envoyés au PSP pour validation ». Aucun contrat d'API ne
 * le permet aujourd'hui : Stripe Connect vérifie ses comptes Express par son
 * propre parcours hébergé et n'accepte pas qu'on lui pousse des pièces. La
 * décision est donc humaine, exactement comme l'est déjà la revue manuelle du
 * KYC (`DecideKycManualReviewUseCase`).
 *
 * Ce choix est réversible sans toucher au domaine : le jour où le contrat
 * existe, un adaptateur appelle `accepter`/`refuser` à la place de
 * l'administrateur, et les règles — motif obligatoire, remise en attente au
 * redépôt, complétude du dossier — ne bougent pas. C'est pour cela qu'aucun
 * statut « transmise au PSP » n'a été inventé : il n'aurait rien fait avancer.
 *
 * Le refus **annonce un fait** plutôt que d'envoyer lui-même le mail (§12) :
 * `PieceJustificativeRefuseeEventHandler` s'en charge, et l'échec d'une
 * notification ne défait pas une décision de conformité.
 */
@Injectable()
export class DeciderPieceUseCase {
  constructor(
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiers: DossierDePiecesRepository,
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly societes: ProfilPMRepository,
    private readonly eventBus: EventBus,
  ) {}

  async accepter(
    societeId: string,
    pieceId: string,
  ): Promise<PieceJustificativeSnapshot> {
    const dossier = await this.dossiers.parSociete(societeId);
    // Passe par la racine : elle seule sait que cette pièce est bien d'ici.
    dossier.accepterLaPiece(pieceId);

    const enregistre = await this.dossiers.save(dossier);
    return enregistre.piece(pieceId).toSnapshot();
  }

  async refuser(
    societeId: string,
    pieceId: string,
    motif: string,
  ): Promise<PieceJustificativeSnapshot> {
    // La société est relue **avant** la décision : le titulaire à prévenir en
    // dépend, et refuser une pièce sans pouvoir dire à qui laisserait un
    // dossier bloqué sans que personne ne le sache.
    const societe = await this.societes.findById(societeId);
    if (!societe) throw new ProfilPMIntrouvableError();

    const dossier = await this.dossiers.parSociete(societeId);
    const piece = dossier.refuserLaPiece(pieceId, motif);

    const enregistre = await this.dossiers.save(dossier);

    // Publié après l'écriture : un abonné ne doit pas réagir à un refus qui
    // n'est pas encore acquis.
    this.eventBus.publish(
      new PieceJustificativeRefuseeDomainEvent(
        societe.userId,
        societeId,
        piece.id,
        piece.type,
        motif,
      ),
    );

    return enregistre.piece(piece.id).toSnapshot();
  }
}
