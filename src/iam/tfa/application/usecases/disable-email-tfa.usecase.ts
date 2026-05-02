import { Inject, Injectable } from '@nestjs/common';
import {
  TFA_REPOSITORY,
  type TfaRepository,
} from 'src/users/domain/ports/tfa.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/domain/ports/user.repository';
import { InvalidCredentialsError } from 'src/users/domain/errors/invalid-credentials.error';

@Injectable()
export class DisableEmailTfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TFA_REPOSITORY) private readonly tfaRepository: TfaRepository,
  ) {}

  async execute(userId: number): Promise<{ success: boolean }> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();

    const method = await this.tfaRepository.findEmailMethodByUserId(userId);
    if (!method || !method.isActive) {
      return { success: false };
    }

    method.isActive = false;
    await this.tfaRepository.saveEmailMethod(method, userId);
    return { success: true };
  }
}
