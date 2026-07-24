import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Bail } from '../../domains/bail';
import {
  BAIL_REPOSITORY,
  type BailRepository,
} from '../ports/repositories/bail.repository';

export interface UpdateBailInput {
  id: string;
  loyerMensuel?: number;
  dateFin?: Date | null;
  contratPdfUrl?: string | null;
}

@Injectable()
export class UpdateBailUseCase {
  constructor(
    @Inject(BAIL_REPOSITORY) private readonly bailRepo: BailRepository,
  ) {}

  async execute(input: UpdateBailInput): Promise<Bail> {
    const bail = await this.bailRepo.findById(input.id);
    if (!bail) throw new NotFoundException('Bail introuvable.');

    if (input.loyerMensuel !== undefined) {
      if (input.loyerMensuel <= 0) {
        throw new BadRequestException('Le loyer doit être positif.');
      }
      bail.loyerMensuel = input.loyerMensuel;
    }
    if (input.dateFin !== undefined) {
      bail.dateFin = input.dateFin;
    }
    if (input.contratPdfUrl !== undefined) {
      bail.contratPdfUrl = input.contratPdfUrl;
    }

    return this.bailRepo.save(bail);
  }
}
