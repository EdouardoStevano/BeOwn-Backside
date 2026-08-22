import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceStatus } from 'src/servicing/domain/enums/echeance.enum';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Montants agrégés fournis par l'admin (répartis ensuite au prorata). */
export interface PatchAggregatedInput {
  datePrevue?: string;
  montantCapital?: number;
  montantInterets?: number;
  montantTotal?: number;
}

/**
 * Modifie une échéance agrégée (date et/ou montants totaux) : met à jour les
 * EcheanceEntity A_VENIR du projet pour ce numéro ; tout montant fourni est
 * réparti au prorata des fractions détenues. Extrait verbatim de
 * AdminEcheancesController.patchAggregated (SOLID vague 4).
 */
@Injectable()
export class PatchAggregatedEcheanceUseCase {
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  async execute(
    projectId: string,
    numero: number,
    dto: PatchAggregatedInput,
  ): Promise<{ updated: number }> {
    const investments = await this.investRepo.find({
      where: { projetId: projectId },
    });
    if (investments.length === 0) {
      throw new NotFoundException('Aucun investissement sur ce projet');
    }

    const investmentIds = investments.map((i) => i.id);
    const targets = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds), numero },
    });
    const editable = targets.filter((e) => e.statut === EcheanceStatus.A_VENIR);
    if (editable.length === 0) {
      throw new BadRequestException(
        'Aucune échéance modifiable pour ce numéro (toutes sont payées ou en retard).',
      );
    }

    const editableInvestIds = new Set(editable.map((e) => e.investissementId));
    const editableInvests = investments.filter((i) =>
      editableInvestIds.has(i.id),
    );
    const totalFractions = editableInvests.reduce(
      (s, i) => s + Number(i.nbTitres),
      0,
    );

    const hasMontant =
      dto.montantCapital !== undefined ||
      dto.montantInterets !== undefined ||
      dto.montantTotal !== undefined;

    if (hasMontant && totalFractions === 0) {
      throw new BadRequestException(
        'Impossible de répartir : aucune fraction détenue par les investisseurs actifs.',
      );
    }

    for (const ech of editable) {
      const patch: Partial<EcheanceEntity> = {};
      if (dto.datePrevue) patch.datePrevue = new Date(dto.datePrevue);

      if (hasMontant) {
        const inv = editableInvests.find((i) => i.id === ech.investissementId);
        if (!inv) continue;
        const share = Number(inv.nbTitres) / totalFractions;

        const newCap =
          dto.montantCapital !== undefined
            ? round2(dto.montantCapital * share)
            : Number(ech.montantCapital);
        const newInt =
          dto.montantInterets !== undefined
            ? round2(dto.montantInterets * share)
            : Number(ech.montantInterets);
        const newTotal =
          dto.montantTotal !== undefined
            ? round2(dto.montantTotal * share)
            : round2(newCap + newInt);

        patch.montantCapital = newCap;
        patch.montantInterets = newInt;
        patch.montantTotal = newTotal;
      }

      if (Object.keys(patch).length > 0) {
        await this.echeanceRepo.update({ id: ech.id }, patch);
      }
    }

    return { updated: editable.length };
  }
}
