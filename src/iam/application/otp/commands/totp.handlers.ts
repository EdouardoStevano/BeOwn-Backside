import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  OTP_SERVICE,
  type OtpService,
  type TotpSecret,
} from 'src/iam/domain/ports/otp.service';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import {
  AccountNotFoundError,
  InvalidOtpError,
} from 'src/iam/domain/errors/iam.errors';
import { SetupTotpCommand, VerifyTotpCommand } from './otp.commands';

@CommandHandler(SetupTotpCommand)
export class SetupTotpHandler implements ICommandHandler<SetupTotpCommand> {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
  ) {}

  async execute(command: SetupTotpCommand): Promise<TotpSecret> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) throw new AccountNotFoundError();

    return this.otpService.generateTotpSecret(command.email);
  }
}

@CommandHandler(VerifyTotpCommand)
export class VerifyTotpHandler implements ICommandHandler<VerifyTotpCommand> {
  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
  ) {}

  async execute(command: VerifyTotpCommand): Promise<boolean> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) throw new AccountNotFoundError();

    // `await` indispensable : la vérification est asynchrone. Sans lui, on
    // testait la véracité d'une Promise — toujours vraie — et n'importe quel
    // code passait.
    const isValid = await this.otpService.verifyTotp(
      command.otp,
      command.secret,
    );
    if (!isValid) throw new InvalidOtpError('Code TOTP invalide');

    return true;
  }
}
