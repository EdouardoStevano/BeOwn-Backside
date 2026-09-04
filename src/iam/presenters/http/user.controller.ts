import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  UnauthorizedException,
  UseGuards,
  Inject,
  BadRequestException,
  UseFilters,
} from '@nestjs/common';
import { IamErrorFilter } from './filters/iam-error.filter';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserType } from 'src/iam/domains/enums/user.enum';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import type { HashingService } from 'src/common/hashing/hashing.service';
import { IsString, IsNotEmpty } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  UpdateUserDto,
  UpdateUserAdminDto,
  UpdatePreferencesDto,
  PreferenceBooleanDto,
  PreferenceLangueDto,
  SetUserTypeDto,
} from 'src/iam/presenters/http/dto/user.dto';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { USER_REPOSITORY } from 'src/iam/domains/ports/user.repository';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import { PROFIL_REPOSITORY } from 'src/profiles/applications/ports/repositories/profil.repository';
import type { ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { DeleteAccountUseCase } from 'src/iam/applications/usecases/account/delete-account.usecase';
import { projeterAccesPorteur } from 'src/porteur-access/domains/acces-porteur';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuditSansCorps } from 'src/common/audit/audit-sans-corps.decorator';

/** Rôles détenant `users:read` — back-office consultation d'un profil tiers. */
const READ_ROLES: string[] = rolesWithPermission('users:read');
/** Rôles détenant `users:manage` — back-office mutation d'un profil tiers. */
const MANAGE_ROLES: string[] = rolesWithPermission('users:manage');

@SkipThrottle()
@ApiTags('Users')
@ApiBearerAuth()
// Portée contrôleur : garantit la traduction des IamError en HTTP (400/401/409...)
// quel que soit l'ordre des filtres globaux (le SentryExceptionFilter attrape-tout
// enregistré dans main.ts passerait sinon avant le filtre APP_FILTER du module).
@UseFilters(IamErrorFilter)
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
    @Inject(HASHING_SERVICE)
    private readonly hashingService: HashingService,
    private readonly notificationEvents: NotificationEventService,
    private readonly deleteAccountUseCase: DeleteAccountUseCase,
  ) {}

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async hasRole(userId: number, roles: string[]): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    return roles.includes((user as any)?.role ?? '');
  }

  // ─── Endpoints ────────────────────────────────────────────────────────────

  // L'inscription vit dans IAM : `POST /auth/sign-up` (reCAPTCHA + throttle
  // 10/15 min). Le `POST /users` qui existait ici appelait le même usecase mais
  // depuis un contrôleur `@SkipThrottle()` et sans captcha — doublon supprimé.

  @ApiOperation({ summary: 'Mon profil complet' })
  @ApiResponse({ status: 200, description: 'Profil complet retourné' })
  @Get('me')
  async getMe(@CurrentUser() user: ActiveUser) {
    const found = await this.userRepository.findById(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    const [profilPP, profilPM, kyc, documents, wallet, accesPorteur] =
      await Promise.all([
        this.profilRepository
          .findProfilPPByUserId(user.userId)
          .catch(() => null),
        this.profilRepository
          .findProfilPMByUserId(user.userId)
          .catch(() => null),
        this.profilRepository.findKycByUserId(user.userId).catch(() => null),
        this.documentRepository.findByUserId(user.userId).catch(() => []),
        this.walletRepository
          .findWalletByUser(user.userId, WalletType.INVESTISSEUR)
          .catch(() => null),
        // Accès porteur : lecture CIBLÉE, hors agrégat (ADR § 3). Sans elle, le
        // drapeau n'apparaissait dans aucune réponse utilisateur — un compte
        // dont la demande venait d'être acceptée n'avait aucun moyen de le
        // savoir, et le front ne pouvait ni afficher le sélecteur d'espace, ni
        // assouplir ses gardes.
        this.userRepository.findAccesPorteur(user.userId).catch(() => null),
      ]);

    // `toJSON(mfa?, accesPorteur?)` : le second facteur n'est pas chargé ici
    // (clé absente = « on n'en sait rien »), l'accès porteur l'est.
    const userSafe = found.toJSON(
      undefined,
      projeterAccesPorteur(accesPorteur),
    );
    const kycStatut = kyc?.statut ?? 'non_demarre';

    // ── Granular completion steps ──────────────────────────────────────────
    // Déduit du profil existant. Le terme `userSafe.userType` qui figurait ici
    // était toujours `undefined` — `userType` est une colonne de l'entité ORM,
    // jamais portée par le modèle de domaine que renvoie le repository ; le
    // `as any` d'alors le masquait.
    const inferredType: 'PP' | 'PM' | null = profilPP
      ? 'PP'
      : profilPM
        ? 'PM'
        : null;

    const hasUserType = !!inferredType;
    const hasProfilData = !!(
      profilPP?.nationalite ||
      profilPP?.dateNaissance ||
      profilPP?.adresseLigne1 ||
      profilPM?.raisonSociale
    );
    const questionnaireCompleted = !!(profilPP?.categoriePsfp || profilPM);
    const kycStatus = kycStatut as string;
    const kycCompleted = kycStatus === 'valide';
    const kycPending = ['en_cours', 'en_revue'].includes(kycStatus);
    const kycRefused = kycStatus === 'refuse';

    type StepStatus = 'completed' | 'pending' | 'not_started' | 'error';
    const completionSteps: Array<{
      id: string;
      label: string;
      status: StepStatus;
      detail?: string;
    }> = [
      {
        id: 'user_type',
        label:
          inferredType === 'PP'
            ? 'Type de compte — Personne physique'
            : inferredType === 'PM'
              ? 'Type de compte — Personne morale'
              : 'Type de compte (PP / PM)',
        status: hasUserType ? 'completed' : 'not_started',
        detail: !hasUserType
          ? 'Choisissez votre type de compte pour commencer'
          : undefined,
      },
      {
        id: 'profil_investisseur',
        label: 'Profil investisseur',
        status: hasProfilData
          ? 'completed'
          : hasUserType
            ? 'pending'
            : 'not_started',
        detail:
          hasUserType && !hasProfilData
            ? 'Complétez vos informations personnelles ou entreprise'
            : undefined,
      },
      {
        id: 'kyc',
        label: "Vérification d'identité (KYC)",
        status: kycCompleted
          ? 'completed'
          : kycRefused
            ? 'error'
            : kycPending
              ? 'pending'
              : 'not_started',
        detail: kycRefused
          ? (kyc?.motifRefus ?? 'KYC refusé — resoumettez vos documents')
          : kycPending
            ? 'Vérification en cours par notre équipe'
            : !kycCompleted
              ? "Soumettez vos documents d'identité"
              : undefined,
      },
      {
        id: 'questionnaire',
        label: "Questionnaire d'adéquation",
        status: questionnaireCompleted
          ? 'completed'
          : hasProfilData
            ? 'pending'
            : 'not_started',
        detail:
          !questionnaireCompleted && hasProfilData
            ? 'Répondez au questionnaire pour finaliser votre profil réglementaire'
            : undefined,
      },
    ];

    const completedCount = completionSteps.filter(
      (s) => s.status === 'completed',
    ).length;
    let completionStep = 0;
    if (hasUserType) completionStep = 1;
    if (hasProfilData) completionStep = 2;
    if (kycPending || kycCompleted) completionStep = 3;
    if (kycCompleted) completionStep = 4;

    return {
      ...userSafe,
      // Expose the inferred type so frontend always knows PP or PM
      // `userType` n'existe que sur l'entité ORM, jamais sur le modèle de
      // domaine : la déduction depuis le profil est la seule source ici.
      userType: inferredType,
      profilPP: profilPP ?? null,
      profilPM: profilPM ?? null,
      kyc: kyc ?? null,
      wallet: wallet ?? null,
      documents,
      completionStep,
      completionSteps,
      completionProgress: Math.round(
        (completedCount / completionSteps.length) * 100,
      ),
      isProfileComplete: kycCompleted && questionnaireCompleted,
      preferences: await this.userRepository
        .findPreferences(user.userId)
        .catch(() => null),
    };
  }

  @ApiOperation({ summary: 'Mettre à jour mon profil' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  // Nom et prénom sont des identifiants directs : les recopier dans
  // `audit_log`, conservé cinq ans et hors barème de purge, en ferait une
  // seconde source d'identité que l'anonymisation RGPD ne toucherait pas.
  // L'entrée d'audit garde qui a modifié quoi et quand — pas les valeurs.
  @AuditSansCorps()
  @Patch('me')
  async updateMe(@CurrentUser() user: ActiveUser, @Body() dto: UpdateUserDto) {
    const found = await this.userRepository.findById(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');
    found.rename(dto.firstname || undefined, dto.lastname);
    const updated = await this.userRepository.update(found);
    return updated.toJSON();
  }

  @ApiOperation({ summary: 'Lire mes préférences' })
  @ApiResponse({ status: 200, description: 'Préférences utilisateur' })
  @Get('me/preferences')
  async getMyPreferences(@CurrentUser() user: ActiveUser) {
    return this.userRepository.findPreferences(user.userId);
  }

  @ApiOperation({ summary: 'Mettre à jour mes préférences (bulk)' })
  @ApiResponse({ status: 200, description: 'Préférences mises à jour' })
  @Patch('me/preferences')
  async updateMyPreferences(
    @CurrentUser() user: ActiveUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.userRepository.savePreferences(user.userId, dto);
  }

  // ─── Bascules de préférences ────────────────────────────────────────────
  //
  // Ces sept routes typaient leur corps par une INTERFACE INLINE
  // (`{ value: boolean }`). TypeScript efface les interfaces à la compilation :
  // le métadonnée de type vu à l'exécution était `Object`, que le
  // `ValidationPipe` global ignore entièrement. Ni `whitelist`, ni
  // `forbidNonWhitelisted`, ni le moindre décorateur ne s'appliquaient — un
  // corps vide, une chaîne à la place d'un booléen ou des champs surnuméraires
  // passaient jusqu'au repository. Les DTO existaient déjà dans `user.dto.ts`
  // mais n'étaient câblés nulle part : les brancher rend la validation
  // effective.

  @ApiOperation({ summary: 'Changer la langue' })
  @ApiResponse({ status: 400, description: 'Corps invalide' })
  @Patch('me/preferences/langue')
  async updateLangue(
    @CurrentUser() user: ActiveUser,
    @Body() body: PreferenceLangueDto,
  ) {
    return this.userRepository.savePreferences(user.userId, {
      langue: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer le masquage des montants sensibles' })
  @ApiResponse({ status: 400, description: 'Corps invalide' })
  @Patch('me/preferences/masquer-montants')
  async toggleMasquerMontants(
    @CurrentUser() user: ActiveUser,
    @Body() body: PreferenceBooleanDto,
  ) {
    return this.userRepository.savePreferences(user.userId, {
      masquerMontants: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer les notifications email' })
  @ApiResponse({ status: 400, description: 'Corps invalide' })
  @Patch('me/preferences/notif-email')
  async toggleNotifEmail(
    @CurrentUser() user: ActiveUser,
    @Body() body: PreferenceBooleanDto,
  ) {
    return this.userRepository.savePreferences(user.userId, {
      notifEmail: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer les notifications SMS' })
  @ApiResponse({ status: 400, description: 'Corps invalide' })
  @Patch('me/preferences/notif-sms')
  async toggleNotifSms(
    @CurrentUser() user: ActiveUser,
    @Body() body: PreferenceBooleanDto,
  ) {
    return this.userRepository.savePreferences(user.userId, {
      notifSms: body.value,
    });
  }

  @ApiOperation({ summary: 'Basculer les emails marketing' })
  @ApiResponse({ status: 400, description: 'Corps invalide' })
  @Patch('me/preferences/notif-marketing')
  async toggleNotifMarketing(
    @CurrentUser() user: ActiveUser,
    @Body() body: PreferenceBooleanDto,
  ) {
    return this.userRepository.savePreferences(user.userId, {
      notifMarketing: body.value,
    });
  }

  @ApiOperation({ summary: "Basculer l'authentification multifacteur" })
  // Deux chemins pour un seul handler : `mfa` est le nom retenu, `tfa` reste
  // servi parce que le front déployé l'appelle. Retirer l'ancien casserait les
  // clients en production — il partira quand ils auront basculé.
  @ApiResponse({ status: 400, description: 'Corps invalide' })
  @Patch(['me/preferences/mfa', 'me/preferences/tfa'])
  async toggleMfa(
    @CurrentUser() user: ActiveUser,
    @Body() body: PreferenceBooleanDto,
  ) {
    return this.userRepository.savePreferences(user.userId, {
      twoFactorEnabled: body.value,
    });
  }

  @ApiOperation({
    summary: "Définir le type d'investisseur (PP ou PM)",
    description:
      "Enregistre la DÉCLARATION de type faite à la première étape de l'onboarding, avant la création du profil. La source de vérité du type de compte reste la présence d'un profil PP ou PM — c'est elle que `GET /users/me` expose dans `completionSteps`.",
  })
  @ApiResponse({ status: 200, description: 'Type mis à jour' })
  @ApiResponse({ status: 400, description: 'Type invalide : PP ou PM attendu' })
  @Patch('me/type')
  async setUserType(
    @CurrentUser() user: ActiveUser,
    @Body() body: SetUserTypeDto,
  ) {
    // Le contrôle manuel qui vivait ici est désormais porté par le DTO
    // (`@IsEnum(UserType)`) : la validation se lit sur le contrat, et le
    // ValidationPipe rend une 400 normalisée au lieu d'un message maison.
    const found = await this.userRepository.findById(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    // Écriture directe et assumée de la colonne : `userType` n'appartient pas
    // à l'agrégat `User`. La ligne précédente posait `(found as any).userType`
    // sur le modèle de domaine puis appelait `update()` — le mapper de
    // persistance ne connaissant pas ce champ, l'endpoint ne faisait RIEN.
    await this.userRepository.updateUserType(user.userId, body.userType);

    return { ...found.toJSON(), userType: body.userType };
  }

  @ApiOperation({
    summary: 'Obtenir un utilisateur par ID (soi-même ou admin)',
  })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur" })
  @ApiResponse({
    status: 200,
    description: 'Utilisateur + KYC + wallet retournés',
  })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    const isSelf = currentUser.userId === id;
    const canRead =
      isSelf || (await this.hasRole(currentUser.userId, READ_ROLES));
    if (!canRead) throw new ForbiddenException('Accès refusé.');

    const found = await this.userRepository.findById(id);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    const [kyc, wallet] = await Promise.all([
      this.profilRepository.findKycByUserId(id).catch(() => null),
      this.walletRepository
        .findWalletByUser(id, WalletType.INVESTISSEUR)
        .catch(() => null),
    ]);

    return { ...found.toJSON(), kyc: kyc ?? null, wallet: wallet ?? null };
  }

  @ApiOperation({ summary: 'Mettre à jour un utilisateur (admin seulement)' })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur cible" })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour' })
  @ApiResponse({ status: 403, description: 'Accès refusé — rôle admin requis' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  // Même raison que `PATCH /users/me`, l'acte venant ici d'un tiers : la
  // modification d'identité par un administrateur est tracée (acteur, cible,
  // statut, champs modifiés via `profileUpdatedByAdmin`), sans recopier les
  // valeurs nominatives.
  @AuditSansCorps()
  @RequirePermission('users:manage')
  @Patch(':id')
  async updateById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
    @Body() dto: UpdateUserAdminDto,
  ) {
    if (!(await this.hasRole(currentUser.userId, MANAGE_ROLES))) {
      throw new ForbiddenException('Accès réservé aux administrateurs.');
    }
    const found = await this.userRepository.findById(id);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    const changed: string[] = [];
    // `rename` compare avant d'écrire et signale si quelque chose a bougé :
    // l'audit reste précis sans que le contrôleur relise les attributs.
    if (dto.firstname !== undefined && found.rename(dto.firstname)) {
      changed.push('firstname');
    }
    if (dto.lastname !== undefined && found.rename(undefined, dto.lastname)) {
      changed.push('lastname');
    }
    if (dto.status !== undefined && dto.status !== (found as any).status) {
      (found as any).status = dto.status;
      changed.push('status');
    }

    const updated = await this.userRepository.update(found);
    if (changed.length > 0 && id !== currentUser.userId) {
      this.notificationEvents.profileUpdatedByAdmin(
        id,
        changed,
        currentUser.userId,
      );
    }
    return updated.toJSON();
  }

  @ApiOperation({
    summary:
      'Supprimer mon compte (soft-delete après confirmation de mot de passe et levée des bloqueurs)',
  })
  @ApiResponse({ status: 204, description: 'Compte supprimé' })
  @ApiResponse({
    status: 401,
    description: 'Mot de passe incorrect (code INVALID_PASSWORD)',
  })
  @ApiResponse({
    status: 409,
    description: 'Suppression bloquée (ACCOUNT_DELETION_BLOCKED)',
  })
  @ApiResponse({ status: 429, description: 'Trop de tentatives — 5 / 15 min' })
  /**
   * Sortie explicite du `@SkipThrottle()` de classe.
   *
   * Cette route COMPARE UN MOT DE PASSE et distingue « mot de passe
   * incorrect » (401) de « suppression bloquée » (409) : c'est un oracle de
   * mot de passe, utilisable depuis une session volée pour retrouver le mot de
   * passe en clair de la victime — et le réutiliser ailleurs. Un contrôleur
   * marqué `@SkipThrottle()` en faisait un oracle SANS aucune limite.
   *
   * Palier `auth`, donc fail-closed sur panne Redis : mieux vaut une
   * suppression de compte reportée qu'un oracle laissé ouvert.
   */
  @SkipThrottle({ short: false, medium: false, auth: false })
  @Throttle({ auth: { ttl: 900_000, limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  async deleteMe(
    @CurrentUser() user: ActiveUser,
    @Body() dto: DeleteAccountDto,
  ) {
    // findByIdWithPassword : findById laisse la colonne password (select:false)
    // à undefined, ce qui casserait la vérification pour TOUS les comptes.
    const found = await this.userRepository.findByIdWithPassword(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    // Le modèle domaine n'expose le hash que par le getter `passwordHash`
    // (l'ancien accès `(found as any).password` lisait un champ d'entité qui
    // n'existe plus sur le domaine : il renvoyait undefined et cassait la
    // suppression self-service pour TOUS les comptes).
    const passwordHash = found.passwordHash;
    if (!passwordHash)
      throw new UnauthorizedException('Confirmation impossible.');

    const valid = await this.hashingService.compare(dto.password, passwordHash);
    if (!valid) {
      // Code structuré : le Frontside branche un intercepteur dessus. Sans ce
      // code, son intercepteur croit à une session expirée, rafraîchit le
      // token et rejoue le DELETE.
      throw new UnauthorizedException({
        message: 'Mot de passe incorrect.',
        code: 'INVALID_PASSWORD',
      });
    }

    await this.deleteAccountUseCase.execute(user.userId, {
      userId: user.userId,
      role: (found as any).role ?? user.role ?? '',
    });
  }
}
