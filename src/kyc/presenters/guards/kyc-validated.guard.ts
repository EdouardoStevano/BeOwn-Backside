import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/kyc/domains/ports/kyc.repository';
import { KycStatus } from 'src/kyc/domains/enums/kyc-status.enum';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';

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
 * À monter après `JwtAuthGuard`. Bloque la route si le compte authentifié n'a
 * pas de dossier KYC validé et encore valide. La validation du KYC implique que
 * l'identité a été vérifiée : c'est le signal unique et faisant foi de « ce
 * compte peut réaliser des opérations financières » (dépôt, investissement,
 * marché secondaire, retrait).
 *
 * **Il lit le dossier par son port, plus par l'entité ORM.** Le garde vivait
 * dans `common/auth/` et injectait directement `Repository<KycEntity>` : chacun
 * des quatre modules qui le montaient (Investments, Reservations,
 * SecondaryMarket, Payments) devait donc déclarer `TypeOrmModule.forFeature([KycEntity])`,
 * c'est-à-dire connaître la table d'un autre contexte pour poser un garde
 * (§12.9). Ils importent désormais `KycModule`, qui l'exporte.
 *
 * Il reste un adapter d'entrée — d'où sa place dans `presenters/guards/` (§2) —
 * mais il appartient à ce contexte : la règle qu'il applique est celle du
 * dossier, pas celle de l'authentification.
 */
@Injectable()
export class KycValidatedGuard implements CanActivate {
  constructor(
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user: ActiveUser | undefined = req.user;
    if (!user?.userId) {
      throw new ForbiddenException('Authentification requise');
    }

    const kyc = await this.kycRepository.findByUserId(user.userId);

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
