import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TwoFactorController } from 'src/iam/presenters/http/two-factor.controller';
import { TwoFactorChallengeService } from './two-factor-challenge.service';
import {
  ConfirmTwoFactorHandler,
  DisableTwoFactorHandler,
  EnrollTwoFactorHandler,
} from './commands/two-factor.handlers';

const CommandHandlers = [
  EnrollTwoFactorHandler,
  ConfirmTwoFactorHandler,
  DisableTwoFactorHandler,
];

/**
 * L'enrôlement du second facteur. Le TwoFactorChallengeService est exporté :
 * l'authentification s'en sert aussi, pour envoyer et vérifier le code de la
 * seconde étape du sign-in.
 */
@Module({
  imports: [CqrsModule],
  providers: [...CommandHandlers, TwoFactorChallengeService],
  controllers: [TwoFactorController],
  exports: [TwoFactorChallengeService],
})
export class TwoFactorModule {}
