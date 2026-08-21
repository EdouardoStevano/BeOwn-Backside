import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  NOTIF_UNSUBSCRIBE_TYPE,
  type UnsubscribeTokenPayload,
} from 'src/iam/application/dto/auth-token';
import { TokenService } from 'src/iam/application/services/token/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { UpdatePreferencesUseCase } from 'src/iam/application/usecases/preferences/update-preferences.usecase';

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
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly updatePreferences: UpdatePreferencesUseCase,
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

    // Idempotent : rejouer le lien laisse le réglage à false et renvoie 200 —
    // le use case n'écrit même pas si rien ne change.
    await this.updatePreferences.execute(payload.sub, {
      notifMarketing: false,
    });

    return { success: true };
  }
}
