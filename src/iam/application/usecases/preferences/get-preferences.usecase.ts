import { Inject, Injectable } from '@nestjs/common';
import {
  PREFERENCES_REPOSITORY,
  type PreferencesRepository,
} from 'src/iam/domain/repositories/preferences.repository';
import { Preferences } from 'src/iam/domain/entities/preferences';

/** Réglages du titulaire — ceux par défaut s'il n'en a jamais posé. */
@Injectable()
export class GetPreferencesUseCase {
  constructor(
    @Inject(PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: PreferencesRepository,
  ) {}

  execute(userId: number): Promise<Preferences> {
    return this.preferencesRepository.findByUserId(userId);
  }
}
