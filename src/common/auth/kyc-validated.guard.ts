import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import type { ActiveUser } from './current-user.decorator';

/** Code d'erreur stable consommé par le front pour distinguer ce refus d'un 403 générique. */
export const KYC_NOT_VALIDATED_CODE = 'KYC_NOT_VALIDATED';

/** Message affiché au front — contrat fixe, ne pas varier selon la cause du refus. */
export const KYC_NOT_VALIDATED_MESSAGE =
  "Profil non validé — complétez votre vérification d'identité.";

const kycNotValidatedException = (): ForbiddenException =>
  new ForbiddenException({
    statusCode: HttpStatus.FORBIDDEN,
    message: KYC_NOT_VALIDATED_MESSAGE,
    code: KYC_NOT_VALIDATED_CODE,
  });

/**
 * Use after JwtAuthGuard. Blocks the route if the authenticated user does not
 * have an approved KYC (statut = VALIDE). KYC validation by admin implies that
 * the profile is complete and identity is verified, so it is the single
 * authoritative signal for "user may perform financial actions" (dépôt,
 * investissement, marché secondaire, retrait).
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
      throw kycNotValidatedException();
    }

    if (kyc.statut !== KycStatus.VALIDE) {
      throw kycNotValidatedException();
    }

    if (kyc.valideJusquAu && new Date(kyc.valideJusquAu) < new Date()) {
      throw kycNotValidatedException();
    }

    return true;
  }
}
