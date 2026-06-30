import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Bail } from '../../domains/bail';
import { Locataire } from '../../domains/locataire';
import { StatutBail } from '../../domains/enums/statut-bail.enum';
import {
  BAIL_REPOSITORY,
  type BailRepository,
} from '../ports/repositories/bail.repository';
import {
  LOCATAIRE_REPOSITORY,
  type LocataireRepository,
} from '../ports/repositories/locataire.repository';
import {
  UNITE_LOUABLE_REPOSITORY,
  type UniteLouableRepository,
} from '../ports/repositories/unite-louable.repository';

export interface CreateBailInput {
  uniteLouableId: string;
  locataire: {
    nomComplet: string;
    email?: string | null;
    telephone?: string | null;
  };
  loyerMensuel: number;
  dateDebut: Date;
  dateFin?: Date | null;
  spvId: string;
  contratPdfUrl?: string | null;
}

@Injectable()
export class CreateBailUseCase {
  constructor(
    @Inject(BAIL_REPOSITORY) private readonly bailRepo: BailRepository,
    @Inject(LOCATAIRE_REPOSITORY)
    private readonly locataireRepo: LocataireRepository,
    @Inject(UNITE_LOUABLE_REPOSITORY)
    private readonly uniteRepo: UniteLouableRepository,
  ) {}

  async execute(input: CreateBailInput): Promise<Bail> {
    const unite = await this.uniteRepo.findById(input.uniteLouableId);
    if (!unite) throw new NotFoundException('Unité louable introuvable.');
    if (input.loyerMensuel <= 0) {
      throw new BadRequestException('Le loyer doit être positif.');
    }

    const loc = new Locataire();
    loc.nomComplet = input.locataire.nomComplet;
    loc.email = input.locataire.email ?? null;
    loc.telephone = input.locataire.telephone ?? null;
    loc.spvId = input.spvId;
    const savedLoc = await this.locataireRepo.save(loc);

    const b = new Bail();
    b.uniteLouableId = input.uniteLouableId;
    b.locataireId = savedLoc.id;
    b.loyerMensuel = input.loyerMensuel;
    b.dateDebut = input.dateDebut;
    b.dateFin = input.dateFin ?? null;
    b.statut = StatutBail.ACTIF;
    b.contratPdfUrl = input.contratPdfUrl ?? null;
    return this.bailRepo.save(b);
  }
}
