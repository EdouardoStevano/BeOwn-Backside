import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/compliance/domain/repositories/dossier-de-pieces.repository';
import { TypePieceJustificative } from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { TypePieceIdentite } from 'src/compliance/domain/enums/type-piece-identite.enum';
import { FichierDepose } from 'src/compliance/domain/value-objects/fichier-depose.vo';
import { BeneficiaireDeLaPieceIncoherentError } from 'src/compliance/domain/errors';
import {
  BENEFICIAIRES_DE_LA_SOCIETE_QUERY,
  type BeneficiairesDeLaSocieteQuery,
} from '../../ports/beneficiaires-de-la-societe.query';
import {
  PIECE_JUSTIFICATIVE_STORAGE,
  type PieceJustificativeStorage,
} from '../../ports/piece-justificative-storage.port';
import {
  VueDossierDePieces,
  vueDossierDePieces,
} from '../../mappers/dossier-de-pieces-vue.mapper';
import { GetProfilPMUseCase } from '../profiles/get-profil-pm.usecase';
import { annoncerLaCompletude } from './annoncer-la-completude';

/** Les octets d'une face, tels que le contrôleur les a reçus. */
export interface FaceDeposee {
  contenu: Buffer;
  nomOrigine: string;
  mimeType: string;
  tailleOctets: number;
}

export interface DepotDePiece {
  societeId: string;
  type: TypePieceJustificative;
  beneficiaireId: string | null;
  dateEmission: Date | null;
  /** Le recto — ou l'unique face, pour les pièces qui n'ont pas de dos. */
  fichier: FaceDeposee;
  /**
   * Le dos du document.
   *
   * Exigé pour une pièce d'identité, interdit ailleurs — c'est
   * `DossierDePieces.deposer` qui le tranche, pas ce use case (§14).
   */
  verso?: FaceDeposee | null;
  /**
   * Quel document d'identité est déposé.
   *
   * Exigé pour la pièce d'identité d'un bénéficiaire, interdit ailleurs — et
   * c'est lui, non le type, qui décide si un verso est attendu. `DossierDePieces`
   * tranche les deux (§14).
   */
  natureIdentite?: TypePieceIdentite | null;
}

/**
 * Dépôt d'une pièce justificative au dossier d'une société.
 *
 * Ce use case n'orchestre que des accès (§14) : vérifier que la société est
 * bien celle du demandeur, ranger les octets, confier la pièce au dossier,
 * persister. Ce qui décide — un fichier est-il recevable, une pièce en
 * remplace-t-elle une autre, le dossier est-il complet — vit dans
 * `FichierDepose` et `DossierDePieces`, où cela s'éprouve sans magasin de
 * fichiers ni base de données.
 *
 * **L'ordre des trois contrôles n'est pas indifférent.** L'appartenance de la
 * société est vérifiée en premier : sans cela, l'uuid d'une société tierce
 * suffirait à y déposer un document, et les octets seraient déjà rangés quand
 * on s'en apercevrait. Le bénéficiaire ensuite, parce qu'il se vérifie sans
 * rien écrire. Le stockage en dernier, une fois qu'il ne reste plus de raison
 * de refuser.
 *
 * Il reste une trace possible : un fichier rangé puis un `save` en échec laisse
 * des octets orphelins dans le magasin. C'est le sens de la fuite le moins
 * grave — l'inverse, une ligne pointant vers des octets absents, donnerait un
 * dossier qui se croit complet et un justificatif illisible à l'instruction.
 */
@Injectable()
export class DeposerPieceUseCase {
  constructor(
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiers: DossierDePiecesRepository,
    @Inject(PIECE_JUSTIFICATIVE_STORAGE)
    private readonly magasin: PieceJustificativeStorage,
    @Inject(BENEFICIAIRES_DE_LA_SOCIETE_QUERY)
    private readonly beneficiaires: BeneficiairesDeLaSocieteQuery,
    // Le contrôle d'appartenance vit là, pour tous ses appelants — le recopier
    // ici en ferait une seconde version à tenir à jour.
    private readonly getProfilPM: GetProfilPMUseCase,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    userId: number,
    depot: DepotDePiece,
  ): Promise<VueDossierDePieces> {
    // Répond « introuvable » à qui n'est pas le titulaire — un 403 confirmerait
    // l'existence de l'identifiant.
    await this.getProfilPM.execute(userId, depot.societeId);

    const beneficiaires = await this.beneficiaires.parSociete(depot.societeId);

    // Une pièce d'identité ne peut documenter qu'un bénéficiaire **de cette
    // société**. L'agrégat vérifie qu'un bénéficiaire est désigné quand le type
    // l'exige ; il ne peut pas savoir s'il existe, ni s'il est d'ici.
    if (
      depot.beneficiaireId !== null &&
      !beneficiaires.some((b) => b.id === depot.beneficiaireId)
    ) {
      throw new BeneficiaireDeLaPieceIncoherentError(depot.type, true);
    }

    // Les deux faces sont rangées de front : elles ne valent que déposées
    // ensemble, et les enchaîner doublerait l'attente sans rien protéger.
    const [recto, verso] = await Promise.all([
      this.ranger(depot.societeId, depot.fichier),
      depot.verso ? this.ranger(depot.societeId, depot.verso) : null,
    ]);

    const dossier = await this.dossiers.parSociete(depot.societeId);

    dossier.deposer({
      type: depot.type,
      beneficiaireId: depot.beneficiaireId,
      dateEmission: depot.dateEmission,
      natureIdentite: depot.natureIdentite ?? null,
      fichier: recto,
      verso,
    });

    const enregistre = await this.dossiers.save(dossier);

    // Un dépôt fait toujours bouger la complétude, dans un sens ou dans
    // l'autre : la dernière pièce attendue rend le dossier complet, et
    // remplacer une pièce déjà acceptée remet son instruction en attente —
    // donc révoque un KYB validé, qui ne doit pas survivre au document sur
    // lequel il reposait.
    annoncerLaCompletude(
      this.eventBus,
      enregistre,
      { id: depot.societeId, utilisateurId: userId },
      beneficiaires.map((b) => b.id),
    );

    return vueDossierDePieces(enregistre, beneficiaires);
  }

  /**
   * Range une face et en fait le Value Object que le domaine sait éprouver.
   *
   * Les bornes — type MIME, taille, clé non vide — sont posées par
   * `FichierDepose`, donc **après** l'écriture des octets. C'est la trace
   * assumée décrite plus haut : un fichier rangé puis refusé laisse des octets
   * orphelins, ce qui vaut mieux qu'une ligne pointant vers rien.
   */
  private async ranger(
    societeId: string,
    face: FaceDeposee,
  ): Promise<FichierDepose> {
    const range = await this.magasin.stocker({
      contenu: face.contenu,
      nomOrigine: face.nomOrigine,
      mimeType: face.mimeType,
      proprietaire: { societeId },
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
