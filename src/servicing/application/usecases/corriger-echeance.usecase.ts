import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { EcheanceOrmMapper } from 'src/servicing/infrastructure/persistence/mappers/echeance.orm-mapper';
import type { EcheanceStatus } from 'src/servicing/domain/enums/echeance.enum';
import { EcheanceIntrouvableError } from 'src/servicing/domain/errors';

/** La correction manuelle d'une échéance par la finance. */
export interface CorrectionEcheance {
  datePrevue?: string;
  montantCapital?: number;
  montantInterets?: number;
  statut?: EcheanceStatus;
}

/**
 * **Corriger ou retirer une échéance** — la reprise en main d'une ligne isolée
 * par le back-office.
 *
 * Le use case orchestre, il ne décide pas (§14). Les deux règles qui
 * gouvernaient ces routes vivaient dans `AdminEcheancesItemController` :
 *
 * - une échéance réglée ne se corrige ni ne s'efface — sa trace fiscale est
 *   arrêtée, et la réécrire ferait diverger l'IFU de ce qui a été versé ;
 * - le montant total se **dérive** du capital et des intérêts. Le contrôleur le
 *   recalculait à la main, et seulement quand l'un des deux changeait : corriger
 *   la seule date laissait un total cohérent par chance, pas par construction.
 *
 * Les deux sont désormais dans `Echeance`.
 */
@Injectable()
export class CorrigerEcheanceUseCase {
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeances: Repository<EcheanceEntity>,
  ) {}

  async corriger(
    echeanceId: string,
    correction: CorrectionEcheance,
  ): Promise<EcheanceEntity> {
    const ligne = await this.ligneOuLeve(echeanceId);

    const echeance = EcheanceOrmMapper.toDomain(ligne);
    echeance.corriger({
      datePrevue: correction.datePrevue
        ? new Date(correction.datePrevue)
        : undefined,
      montantCapital: correction.montantCapital,
      montantInterets: correction.montantInterets,
      statut: correction.statut,
    });

    return this.echeances.save(EcheanceOrmMapper.appliquerSur(ligne, echeance));
  }

  async supprimer(echeanceId: string): Promise<void> {
    const ligne = await this.ligneOuLeve(echeanceId);

    EcheanceOrmMapper.toDomain(ligne).assertSupprimable();

    await this.echeances.delete({ id: echeanceId });
  }

  private async ligneOuLeve(echeanceId: string): Promise<EcheanceEntity> {
    const ligne = await this.echeances.findOne({ where: { id: echeanceId } });
    if (!ligne) throw new EcheanceIntrouvableError(echeanceId);
    return ligne;
  }
}
