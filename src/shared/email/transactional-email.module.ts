import { Module } from '@nestjs/common';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { EmailRecipientReader } from './ports/email-recipient.port';
import { UserEmailRecipientAdapter } from './infrastructure/user-email-recipient.adapter';
import { TransactionalEmailNotifier } from './transactional-email.notifier';

/**
 * Câblage des e-mails transactionnels déclenchés par un événement métier.
 *
 * Volontairement SÉPARÉ de `EmailModule` (@Global), qui ne fournit que le
 * rendu et le transport : celui-ci a besoin du référentiel utilisateurs pour
 * résoudre le destinataire, et imposer cette dépendance à la vingtaine de
 * modules qui n'utilisent que `EMAIL_SERVICE` serait un couplage gratuit.
 * Les modules qui déclenchent réellement ces e-mails (paiements,
 * distributions, profils) importent celui-ci explicitement.
 */
@Module({
  imports: [UsersInfrastructureModule],
  providers: [
    { provide: EmailRecipientReader, useClass: UserEmailRecipientAdapter },
    TransactionalEmailNotifier,
  ],
  exports: [TransactionalEmailNotifier],
})
export class TransactionalEmailModule {}
