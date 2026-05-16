import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import type { ActiveUser } from './current-user.decorator';

/**
 * Use after JwtAuthGuard. Blocks the route if the authenticated user does not
 * have an approved KYC (statut = VALIDE). KYC validation by admin implies that
 * the profile is complete and identity is verified, so it is the single
 * authoritative signal for "user may perform investment actions".
 */
@Injectable()
export class KycValidatedGuard implements CanActivate {
  constructor(
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user: ActiveUser | undefined = req.user;
    if (!user?.userId) {
      throw new ForbiddenException('Authentification requise');
    }

    const kyc = await this.kycRepo.findOne({
      where: { utilisateurId: user.userId },
    });

    if (!kyc) {
      throw new ForbiddenException(
        "Vous devez compléter votre profil KYC avant toute action d'investissement.",
      );
    }

    if (kyc.statut !== KycStatus.VALIDE) {
      throw new ForbiddenException(
        `Votre KYC doit être validé (statut actuel: ${kyc.statut}). Veuillez attendre la validation ou compléter votre dossier.`,
      );
    }

    if (kyc.valideJusquAu && new Date(kyc.valideJusquAu) < new Date()) {
      throw new ForbiddenException(
        'Votre KYC a expiré. Veuillez le renouveler.',
      );
    }

    return true;
  }
}
