import { Inject, Injectable } from '@nestjs/common';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/compliance/domain/repositories/dossier-de-pieces.repository';
import { TypePieceJustificative } from 'src/compliance/domain/enums/type-piece-justificative.enum';
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

export interface DepotDePiece {
  societeId: string;
  type: TypePieceJustificative;
  beneficiaireId: string | null;
  dateEmission: Date | null;
  fichier: {
    contenu: Buffer;
    nomOrigine: string;
    mimeType: string;
    tailleOctets: number;
  };
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

    const range = await this.magasin.stocker({
      contenu: depot.fichier.contenu,
      nomOrigine: depot.fichier.nomOrigine,
      mimeType: depot.fichier.mimeType,
      societeId: depot.societeId,
    });

    const dossier = await this.dossiers.parSociete(depot.societeId);

    dossier.deposer({
      type: depot.type,
      beneficiaireId: depot.beneficiaireId,
      dateEmission: depot.dateEmission,
      fichier: FichierDepose.depose({
        nomOrigine: depot.fichier.nomOrigine,
        cleStockage: range.cleStockage,
        url: range.url,
        mimeType: depot.fichier.mimeType,
        tailleOctets: depot.fichier.tailleOctets,
      }),
    });

    const enregistre = await this.dossiers.save(dossier);

    return vueDossierDePieces(enregistre, beneficiaires);
  }
}
