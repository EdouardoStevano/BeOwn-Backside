import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { MOTIF_REVUE_MANUELLE } from 'src/compliance/domain/entities/kyc-case';
import { TypePieceIdentite } from 'src/compliance/domain/enums/type-piece-identite.enum';
import { FichierDepose } from 'src/compliance/domain/value-objects/fichier-depose.vo';
import {
  PieceIdentiteDeposee,
  PieceIdentiteDeposeeSnapshot,
} from 'src/compliance/domain/value-objects/piece-identite-deposee.vo';
import { KycRevueManuelleDemandeeDomainEvent } from 'src/compliance/domain/events/kyc-revue-manuelle-demandee.domain-event';
import {
  PIECE_JUSTIFICATIVE_STORAGE,
  type PieceJustificativeStorage,
} from '../../ports/piece-justificative-storage.port';
import type { FaceDeposee } from '../pieces/deposer-piece.usecase';

export interface DepotDePieceIdentite {
  type: TypePieceIdentite;
  recto: FaceDeposee;
  /** Exigé sauf pour un passeport — c'est le domaine qui le tranche. */
  verso?: FaceDeposee | null;
}

/** Ce que le titulaire relit après avoir déposé. */
export interface VueDepotPieceIdentite {
  statutKyc: string | null;
  motifRefus: string | null;
  pieceIdentite: PieceIdentiteDeposeeSnapshot | null;
}

/**
 * Le titulaire dépose son document d'identité et demande, par ce geste même,
 * l'examen humain de son dossier.
 *
 * **C'est le recours quand l'automatique n'aboutit pas.** Stripe Identity
 * tranche seul dans le cas normal, et reste la source faisant foi — c'est
 * pourquoi `TypePieceJustificative` exclut délibérément la pièce du titulaire,
 * pour ne pas créer deux sources d'un même fait. Cette exclusion vaut tant que
 * le fournisseur a **su** décider. Refus, revue requise, parcours jamais
 * ouvert : il n'y a alors plus de source du tout, et l'équipe conformité n'a
 * rien à lire. Ce dépôt est ce qui lui donne de quoi trancher.
 *
 * Les quatre documents acceptés sont ceux du cahier des charges — carte
 * d'identité recto-verso, passeport, permis de conduire, titre de séjour — et
 * la règle du verso dépend du type : le passeport porte tout sur sa page de
 * données, les trois autres ont leur date d'expiration au dos.
 *
 * Ce use case n'orchestre que des accès (§14) : ranger les octets, confier le
 * document à la racine, persister, annoncer. Ce qui décide — le verso est-il
 * cohérent, l'identité est-elle déjà vérifiée, le dossier existe-t-il — vit dans
 * `PieceIdentiteDeposee` et `InvestorComplianceProfile`.
 *
 * **Le dépôt et la demande de revue ne se séparent pas**, et c'est la racine
 * qui les pose ensemble : un document déposé sans passage en revue attendrait un
 * examen que personne n'a réclamé, une revue demandée sans document laisserait
 * la conformité devant un dossier vide.
 *
 * Il reste une trace possible : un fichier rangé puis un `save` en échec laisse
 * des octets orphelins dans le magasin. C'est le sens de la fuite le moins
 * grave — l'inverse, une ligne pointant vers des octets absents, donnerait un
 * dossier qui se croit instruisable et une pièce illisible à l'examen.
 */
@Injectable()
export class DeposerPieceIdentiteUseCase {
  constructor(
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
    @Inject(PIECE_JUSTIFICATIVE_STORAGE)
    private readonly magasin: PieceJustificativeStorage,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    userId: number,
    depot: DepotDePieceIdentite,
  ): Promise<VueDepotPieceIdentite> {
    const profil = await this.profils.findByInvestorId(userId);

    // Les deux faces sont rangées de front : elles ne valent que déposées
    // ensemble, et les enchaîner doublerait l'attente sans rien protéger.
    const [recto, verso] = await Promise.all([
      this.ranger(userId, depot.recto),
      depot.verso ? this.ranger(userId, depot.verso) : null,
    ]);

    // Lève si le verso ne correspond pas au type, si l'identité est déjà
    // vérifiée, ou si le dossier est celui d'une société.
    profil.deposerLaPieceIdentitePourRevue(
      PieceIdentiteDeposee.deposer({ type: depot.type, recto, verso }),
    );

    const enregistre = await this.profils.save(profil);

    // Publié après l'écriture, et **réutilisé** plutôt que dédoublé : la
    // conformité est prévenue d'une demande de revue de la même façon, qu'elle
    // vienne d'un dépôt de pièce ou de `RequestKycManualReviewUseCase`. Un
    // second événement aurait obligé chaque abonné à s'abonner deux fois pour
    // réagir au même fait (§8).
    this.eventBus.publish(
      new KycRevueManuelleDemandeeDomainEvent(
        enregistre.dossierKycId as string,
        userId,
        MOTIF_REVUE_MANUELLE,
      ),
    );

    return {
      statutKyc: enregistre.statutKyc,
      motifRefus: enregistre.motifRefusKyc,
      pieceIdentite: enregistre.pieceIdentitePubliee,
    };
  }

  /**
   * Range une face et en fait le Value Object que le domaine sait éprouver.
   *
   * Rangée sous le **titulaire** et non sous une société : c'est ce qui rendra
   * possible une purge ciblée à l'échéance des cinq ans de conservation
   * (RG-KYC-10), sans avoir à ouvrir chaque objet pour savoir de qui il relève.
   */
  private async ranger(
    titulaireId: number,
    face: FaceDeposee,
  ): Promise<FichierDepose> {
    const range = await this.magasin.stocker({
      contenu: face.contenu,
      nomOrigine: face.nomOrigine,
      mimeType: face.mimeType,
      proprietaire: { titulaireId },
    });

    return FichierDepose.depose({
      nomOrigine: face.nomOrigine,
      cleStockage: range.cleStockage,
      url: range.url,
      mimeType: face.mimeType,
      tailleOctets: face.tailleOctets,
    });
  }
}
