import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  CODE_PORTEUR_ACCESS_REQUIS,
  MESSAGE_PORTEUR_ACCESS_REQUIS,
  peutAccederEspacePorteur,
} from 'src/porteur-access/domains/acces-porteur';
import type { ActiveUser } from './current-user.decorator';

const accesPorteurRequis = (): ForbiddenException =>
  new ForbiddenException({
    statusCode: HttpStatus.FORBIDDEN,
    message: MESSAGE_PORTEUR_ACCESS_REQUIS,
    code: CODE_PORTEUR_ACCESS_REQUIS,
  });

/**
 * Ouvre les routes de l'espace porteur aux DEUX populations (décision D1) :
 * les porteurs « purs » (`users.role = 'porteur'`) et les investisseurs dont
 * la demande d'accès a été acceptée (`users.porteurAccess = true`).
 *
 * Il REMPLACE `@Roles(UserRole.PORTEUR)` sur ces routes — il ne s'y ajoute
 * pas : cumuler les deux referme la porte qu'on vient d'ouvrir, le
 * `RolesGuard` global refusant l'investisseur avant même que celui-ci ne
 * s'exécute.
 *
 * ── Le point non négociable ──────────────────────────────────────────────
 * Le verdict est RELU EN BASE à chaque requête, jamais déduit du jeton.
 * `porteurAccess` est une autorisation à ÉTAT, donc révocable : la recopier
 * dans le JWT rendrait tout retrait d'accès inopérant jusqu'à l'expiration du
 * jeton — le bug exact que le lot 2 vient de corriger sur `role` (cf.
 * docs/adr/ADR-role-relu-en-base-et-usertype.md, « le claim entrant identifie,
 * il n'autorise jamais »). Le modèle est `KycValidatedGuard`.
 *
 * Le rôle aussi est relu ici : un compte rétrogradé depuis `porteur` perd
 * l'espace porteur à la requête suivante, pas à l'expiration de son jeton.
 *
 * COÛT ASSUMÉ : une lecture à deux colonnes par requête gardée (~15 routes,
 * trafic porteur), sur la clé primaire de `users`. C'est le prix de la
 * révocabilité, et c'est celui que paie déjà `KycValidatedGuard`.
 *
 * À poser APRÈS `JwtAuthGuard` (qui remplit `request.user`). Il ne remplace
 * AUCUN contrôle par ressource : `assertOwnsProject` et consorts restent
 * seuls à décider qu'un porteur ne touche QUE ses propres projets.
 */
@Injectable()
export class PorteurAccessGuard implements CanActivate {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest();
    const user: ActiveUser | undefined = request.user;
    if (!user?.userId) {
      throw new ForbiddenException('Authentification requise');
    }

    const acces = await this.users.findAccesPorteur(user.userId);
    // Compte disparu entre l'émission du jeton et l'appel : on refuse.
    if (!acces) throw accesPorteurRequis();

    if (!peutAccederEspacePorteur(acces.role, acces.porteurAccess)) {
      throw accesPorteurRequis();
    }

    return true;
  }
}
