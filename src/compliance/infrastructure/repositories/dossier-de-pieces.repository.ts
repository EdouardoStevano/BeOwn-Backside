import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DossierDePieces } from 'src/compliance/domain/aggregates/dossier-de-pieces';
import { DossierDePiecesRepository } from 'src/compliance/domain/repositories/dossier-de-pieces.repository';
import { PieceJustificativeEntity } from '../persistence/entities/piece-justificative.entity';
import { PieceJustificativeOrmMapper } from '../persistence/mappers/piece-justificative.mapper';

/**
 * Le dossier de pièces d'une société, composé depuis sa table.
 *
 * `parSociete` rend **toujours** un dossier : une société sans pièce en a un
 * vide. C'est l'état de départ du parcours, pas une anomalie — et le traduire
 * ici plutôt que chez chaque appelant évite qu'un `null` oublié fasse passer un
 * dossier vide pour complet.
 */
@Injectable()
export class DossierDePiecesTypeOrmRepository implements DossierDePiecesRepository {
  constructor(
    @InjectRepository(PieceJustificativeEntity)
    private readonly pieces: Repository<PieceJustificativeEntity>,
  ) {}

  async parSociete(societeId: string): Promise<DossierDePieces> {
    const lignes = await this.pieces.find({
      where: { societeId },
      order: { deposeeLe: 'ASC' },
    });

    return new DossierDePieces({
      societeId,
      pieces: lignes.map((ligne) =>
        PieceJustificativeOrmMapper.toDomain(ligne),
      ),
    });
  }

  /**
   * Enregistre le dossier d'un bloc.
   *
   * Un seul `save` pour toutes les pièces : elles forment une unité de
   * cohérence, et TypeORM les insère ou les met à jour selon la présence de
   * leur `id` — celles qui viennent d'être déposées n'en ont pas encore (§17).
   *
   * Le dossier est **relu** après écriture plutôt que rendu tel quel : les
   * identités attribuées en base doivent revenir dans l'agrégat, sans quoi
   * l'appelant publierait des pièces sans `id` et le prochain dépôt les
   * dupliquerait au lieu de les remplacer.
   */
  async save(dossier: DossierDePieces): Promise<DossierDePieces> {
    const entities = dossier.pieces.map((piece) =>
      PieceJustificativeOrmMapper.toEntity(piece, dossier.societeId),
    );

    if (entities.length > 0) await this.pieces.save(entities);

    return this.parSociete(dossier.societeId);
  }
}
