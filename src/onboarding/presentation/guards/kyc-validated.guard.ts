import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
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
 * **Et il ne décide plus.** Il portait la règle d'aptitude en trois `if`
 * successifs — dossier présent, statut `VALIDE`, échéance non dépassée — c'est
 *-à-dire une règle métier écrite dans un adapter d'entrée, invisible depuis le
 * domaine et depuis les quatre contextes qui la subissaient (§14). Elle est
 * revenue à `DossierDEntreeEnRelation.peutOperer()`, où elle s'éprouve sans
 * simuler une requête HTTP. Ce qui reste ici est ce qu'un garde doit faire :
 * poser la question, et traduire un « non » en 403.
 */
@Injectable()
export class KycValidatedGuard implements CanActivate {
  constructor(
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user: ActiveUser | undefined = req.user;
    if (!user?.userId) {
      throw new ForbiddenException('Authentification requise');
    }

    const profil = await this.profils.parTitulaire(user.userId);
    if (!profil.peutOperer()) {
      throw kycNotValidatedException();
    }

    return true;
  }
}
