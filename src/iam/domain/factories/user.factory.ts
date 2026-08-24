import { User } from 'src/iam/domain/aggregates/user';
import { Password } from 'src/iam/domain/value-objects/password.vo';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/iam/domain/ports/hashing.service';

export interface CreateUserProps {
  firstname: string;
  lastname: string | null;
  email: string;
  password: string | null;
  socialId: string | null;
  emailVerified?: boolean;
}

/**
 * **Fabrique de comptes** (§23) — elle éprouve le mot de passe, le hache, puis
 * laisse `User.register` porter les invariants du compte.
 *
 * **Elle n'est plus décorée.** Elle portait `@Injectable()` et `@Inject()`, ce
 * que §32 interdit dans `domain/` — c'en est l'exemple littéral. Une fabrique
 * est bien un concept de domaine (§23), et elle a le droit de dépendre d'un
 * **port** du domaine (`HashingService`, §33) : ce qui n'allait pas, c'était le
 * moyen de l'injection, pas la dépendance. `UsersModule` la construit donc
 * explicitement, en lui passant l'adaptateur — c'est le rôle d'un module (§36.4
 * : le conteneur DI gère les instances, il n'a pas à marquer le domaine).
 */
export class UserFactory {
  constructor(private readonly hashingService: HashingService) {}
  async create(props: CreateUserProps): Promise<User> {
    // Le hachage reste ici : c'est la seule responsabilité de cette factory que
    // le domaine ne peut pas assumer (il ignore bcrypt). `User.register` reçoit
    // une empreinte, jamais un mot de passe en clair.
    //
    // Le mot de passe est éprouvé avant d'être haché : une fois l'empreinte
    // calculée, plus personne ne peut dire si la politique était respectée. Un
    // compte social (`password: null`) n'en a pas et n'est donc pas concerné.
    const passwordHash = props.password
      ? await this.hashingService.hash(Password.of(props.password).value)
      : null;

    return User.register({
      firstname: props.firstname,
      lastname: props.lastname,
      email: props.email,
      passwordHash,
      socialId: props.socialId,
      emailVerified: props.emailVerified,
    });
  }
}
