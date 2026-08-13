import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  NOTIF_UNSUBSCRIBE_TYPE,
  TOKEN_SERVICE,
  type TokenService,
  type UnsubscribeTokenPayload,
} from 'src/iam/applications/ports/token.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';

/**
 * Désinscription des communications marketing depuis le lien présent dans les
 * emails/SMS de diffusion (nouveau projet, ouverture de campagne).
 *
 * Réutilise le système de préférences existant (`user_preferences`) : la
 * désinscription bascule `notifMarketing` à false. Les communications
 * transactionnelles (KYC, échéance, dépôt, retrait...) ne passent pas par ce
 * flag et restent envoyées — c'est la sémantique attendue d'un opt-out
 * marketing.
 */
@Injectable()
export class NotificationUnsubscribeService {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async unsubscribe(token: string): Promise<{ success: true }> {
    let payload: UnsubscribeTokenPayload;
    try {
      payload = await this.tokenService.verifyUnsubscribeToken(token);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    // Garde anti-confusion de token : les tokens email (`email_verify`,
    // `password_reset`) sont signés avec le même secret et la même forme de
    // claims. Un token de vérification d'email transite dans une URL GET
    // (logs proxy, historique navigateur) : sans ce contrôle de `type`, il
    // serait rejouable ici. Réciproquement, ce token vit 90 jours et ne doit
    // ouvrir aucune autre porte que la désinscription.
    if (payload?.type !== NOTIF_UNSUBSCRIBE_TYPE) {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    // Idempotent : `savePreferences` fait un upsert, rejouer le lien
    // repositionne simplement le flag à false et renvoie 200.
    await this.userRepository.savePreferences(payload.sub, {
      notifMarketing: false,
    });

    return { success: true };
  }
}
