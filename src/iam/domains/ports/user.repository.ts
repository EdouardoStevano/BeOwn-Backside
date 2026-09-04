import { UserRole, UserType } from 'src/iam/domains/enums/user.enum';
import { User } from 'src/iam/domains/models/user';
import { UserPreferences } from 'src/iam/domains/models/user-preferences';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Le couple qui décide de l'accès à l'espace porteur, tel qu'il est EN BASE.
 *
 * Renvoyé par une lecture ciblée et non par l'agrégat : `porteurAccess`, comme
 * `userType`, n'entre pas dans le modèle de domaine `User` (cf.
 * docs/adr/ADR-role-relu-en-base-et-usertype.md § 3). Les deux champs voyagent
 * ENSEMBLE parce que la règle du double accès (D1) les lit ensemble : les
 * séparer imposerait deux allers-retours par requête gardée.
 */
export interface AccesPorteurEnBase {
  role: UserRole;
  porteurAccess: boolean;
  /**
   * Date du dernier RETRAIT d'accès, `null` tant qu'il court (ou s'il n'a
   * jamais été ouvert). Lue avec les deux autres parce qu'elle est écrite avec
   * elles : le use case qui referme un accès doit pouvoir laisser INTACTE la
   * date d'un retrait antérieur quand son acte n'en produit pas de nouveau
   * (cf. `accesRevoqueLeApresDecision`). C'est aussi le point de départ du
   * barème de conservation d'une demande acceptée.
   */
  accesRevoqueLe: Date | null;
}

export interface UserRepository {
  save(user: User): Promise<User>;
  findById(userId: number): Promise<User | null>;
  /**
   * Comme findById mais avec la colonne `password` (normalement
   * `select: false`) explicitement chargée — réservé à la vérification du mot
   * de passe (ex. suppression self-service). NE PAS utiliser findById pour
   * cela : il ne sélectionne pas le hash.
   */
  findByIdWithPassword(userId: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(user: User): Promise<User>;
  /**
   * Écrit la colonne `users.userType`, et elle seule.
   *
   * Méthode dédiée parce que `userType` n'appartient pas à l'agrégat `User` :
   * la source de vérité du type de compte est la présence d'un profil PP ou PM
   * (`GET /users/me` la déduit ainsi), la colonne ne gardant que la
   * **déclaration d'intention** faite à la première étape de l'onboarding,
   * avant que le profil n'existe. Elle passait auparavant par une propriété
   * fantôme posée sur le modèle de domaine (`(found as any).userType = …`), que
   * le mapper de persistance jetait sans bruit : `PATCH /users/me/type`
   * n'écrivait rien.
   */
  updateUserType(userId: number, userType: UserType): Promise<void>;
  /**
   * Lit l'état d'accès porteur du compte en une seule requête.
   *
   * C'est la lecture qu'exécute `PorteurAccessGuard` à CHAQUE requête sur une
   * route de l'espace porteur : l'accès porteur est une autorisation à état,
   * donc révocable, et le claim du jeton ne peut pas en tenir lieu (même
   * raisonnement que pour `role` — ADR § 1, « le claim entrant identifie, il
   * n'autorise jamais »). Modèle : `KycValidatedGuard`.
   */
  findAccesPorteur(userId: number): Promise<AccesPorteurEnBase | null>;
  /**
   * Écrit l'ÉTAT d'accès porteur — le drapeau et l'horodatage de retrait — en
   * une seule opération, et rien d'autre. Même motif que `updateUserType` : ces
   * colonnes n'appartiennent pas à l'agrégat `User`, elles sont posées par la
   * DÉCISION d'un instructeur (module `porteur-access`), jamais par une édition
   * de profil.
   *
   * Les deux valeurs voyagent ENSEMBLE parce qu'elles forment un invariant
   * (« accès ouvert ⟹ pas de date de retrait ») : les écrire en deux fois
   * laisserait une fenêtre où l'état est contradictoire, et la purge RGPD lit
   * précisément ce couple. Ce que chacune doit valoir est décidé par le
   * domaine (`acterAccesPorteur`, `accesRevoqueLeApresDecision`), pas ici.
   */
  updatePorteurAccess(
    userId: number,
    porteurAccess: boolean,
    accesRevoqueLe: Date | null,
  ): Promise<void>;
  findOneBySocialId(socialId: string): Promise<User | null>;
  findPreferences(userId: number): Promise<UserPreferences>;
  savePreferences(
    userId: number,
    prefs: Partial<UserPreferences>,
  ): Promise<UserPreferences>;
}
