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
  Post,
  UnauthorizedException,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserStatus, UserType } from 'src/users/infrastructure/persistences/entities/user.entity';
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
import { UsersService } from 'src/users/applications/users.service';
import { RegisterDto, UpdateUserDto, UpdateUserAdminDto, UpdatePreferencesDto } from '../dto/user.dto';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { USER_REPOSITORY } from 'src/users/applications/ports/repositories/user.repository';
import type { UserRepository } from 'src/users/applications/ports/repositories/user.repository';
import { PROFIL_REPOSITORY } from 'src/profiles/applications/ports/repositories/profil.repository';
import type { ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { SkipThrottle } from '@nestjs/throttler';

/** Rôles détenant `users:read` — back-office consultation d'un profil tiers. */
const READ_ROLES: string[] = rolesWithPermission('users:read');
/** Rôles détenant `users:manage` — back-office mutation d'un profil tiers. */
const MANAGE_ROLES: string[] = rolesWithPermission('users:manage');

@SkipThrottle()
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly usersService: UsersService,
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
  ) {}

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async hasRole(userId: number, roles: string[]): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    return roles.includes((user as any)?.role ?? '');
  }

  // ─── Endpoints ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Créer un nouveau compte utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @Post()
  register(@Body() dto: RegisterDto) {
    return this.usersService.create(dto);
  }

  @ApiOperation({ summary: 'Mon profil complet' })
  @ApiResponse({ status: 200, description: 'Profil complet retourné' })
  @Get('me')
  async getMe(@CurrentUser() user: ActiveUser) {
    const found = await this.userRepository.findById(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    const [profilPP, profilPM, kyc, documents, wallet] = await Promise.all([
      this.profilRepository.findProfilPPByUserId(user.userId).catch(() => null),
      this.profilRepository.findProfilPMByUserId(user.userId).catch(() => null),
      this.profilRepository.findKycByUserId(user.userId).catch(() => null),
      this.documentRepository.findByUserId(user.userId).catch(() => []),
      this.walletRepository
        .findWalletByUser(user.userId, WalletType.INVESTISSEUR)
        .catch(() => null),
    ]);

    const { password: _p, ...userSafe } = found as any;
    const kycStatut = kyc?.statut ?? 'non_demarre';

    // ── Granular completion steps ──────────────────────────────────────────
    // Infer user type from profile records if userType field not explicitly set
    const inferredType: 'PP' | 'PM' | null =
      userSafe.userType ?? (profilPP ? 'PP' : profilPM ? 'PM' : null);

    const hasUserType = !!(inferredType);
    const hasProfilData = !!(
      profilPP?.nationalite || profilPP?.dateNaissance || profilPP?.adresseLigne1 || profilPM?.raisonSociale
    );
    const questionnaireCompleted = !!(
      profilPP?.categoriePsfp || profilPM
    );
    const kycStatus = kycStatut as string;
    const kycCompleted = kycStatus === 'valide';
    const kycPending = ['en_cours', 'en_revue'].includes(kycStatus);
    const kycRefused = kycStatus === 'refuse';

    type StepStatus = 'completed' | 'pending' | 'not_started' | 'error';
    const completionSteps: Array<{ id: string; label: string; status: StepStatus; detail?: string }> = [
      {
        id: 'user_type',
        label: inferredType === 'PP'
          ? 'Type de compte — Personne physique'
          : inferredType === 'PM'
          ? 'Type de compte — Personne morale'
          : 'Type de compte (PP / PM)',
        status: hasUserType ? 'completed' : 'not_started',
        detail: !hasUserType ? 'Choisissez votre type de compte pour commencer' : undefined,
      },
      {
        id: 'profil_investisseur',
        label: 'Profil investisseur',
        status: hasProfilData ? 'completed' : hasUserType ? 'pending' : 'not_started',
        detail: hasUserType && !hasProfilData
          ? 'Complétez vos informations personnelles ou entreprise'
          : undefined,
      },
      {
        id: 'kyc',
        label: "Vérification d'identité (KYC)",
        status: kycCompleted ? 'completed'
          : kycRefused ? 'error'
          : kycPending ? 'pending'
          : 'not_started',
        detail: kycRefused
          ? (kyc?.motifRefus ?? 'KYC refusé — resoumettez vos documents')
          : kycPending ? 'Vérification en cours par notre équipe'
          : !kycCompleted ? "Soumettez vos documents d'identité"
          : undefined,
      },
      {
        id: 'questionnaire',
        label: "Questionnaire d'adéquation",
        status: questionnaireCompleted ? 'completed'
          : hasProfilData ? 'pending'
          : 'not_started',
        detail: !questionnaireCompleted && hasProfilData
          ? 'Répondez au questionnaire pour finaliser votre profil réglementaire'
          : undefined,
      },
    ];

    const completedCount = completionSteps.filter((s) => s.status === 'completed').length;
    let completionStep = 0;
    if (hasUserType) completionStep = 1;
    if (hasProfilData) completionStep = 2;
    if (kycPending || kycCompleted) completionStep = 3;
    if (kycCompleted) completionStep = 4;

    return {
      ...userSafe,
      // Expose the inferred type so frontend always knows PP or PM
      userType: inferredType ?? userSafe.userType ?? null,
      profilPP: profilPP ?? null,
      profilPM: profilPM ?? null,
      kyc: kyc ?? null,
      wallet: wallet ?? null,
      documents,
      completionStep,
      completionSteps,
      completionProgress: Math.round((completedCount / completionSteps.length) * 100),
      isProfileComplete: kycCompleted && questionnaireCompleted,
      preferences: await this.userRepository.findPreferences(user.userId).catch(() => null),
    };
  }

  @ApiOperation({ summary: 'Mettre à jour mon profil' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  @Patch('me')
  async updateMe(@CurrentUser() user: ActiveUser, @Body() dto: UpdateUserDto) {
    const found = await this.userRepository.findById(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');
    if (dto.firstname) found.firstname = dto.firstname;
    if (dto.lastname !== undefined) found.lastname = dto.lastname ?? null;
    const updated = await this.userRepository.update(found);
    const { password: _p, ...safe } = updated as any;
    return safe;
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

  @ApiOperation({ summary: 'Changer la langue' })
  @Patch('me/preferences/langue')
  async updateLangue(
    @CurrentUser() user: ActiveUser,
    @Body() body: { value: string },
  ) {
    return this.userRepository.savePreferences(user.userId, { langue: body.value });
  }

  @ApiOperation({ summary: 'Basculer le masquage des montants sensibles' })
  @Patch('me/preferences/masquer-montants')
  async toggleMasquerMontants(
    @CurrentUser() user: ActiveUser,
    @Body() body: { value: boolean },
  ) {
    return this.userRepository.savePreferences(user.userId, { masquerMontants: body.value });
  }

  @ApiOperation({ summary: 'Basculer les notifications email' })
  @Patch('me/preferences/notif-email')
  async toggleNotifEmail(
    @CurrentUser() user: ActiveUser,
    @Body() body: { value: boolean },
  ) {
    return this.userRepository.savePreferences(user.userId, { notifEmail: body.value });
  }

  @ApiOperation({ summary: 'Basculer les notifications SMS' })
  @Patch('me/preferences/notif-sms')
  async toggleNotifSms(
    @CurrentUser() user: ActiveUser,
    @Body() body: { value: boolean },
  ) {
    return this.userRepository.savePreferences(user.userId, { notifSms: body.value });
  }

  @ApiOperation({ summary: 'Basculer les emails marketing' })
  @Patch('me/preferences/notif-marketing')
  async toggleNotifMarketing(
    @CurrentUser() user: ActiveUser,
    @Body() body: { value: boolean },
  ) {
    return this.userRepository.savePreferences(user.userId, { notifMarketing: body.value });
  }

  @ApiOperation({ summary: 'Basculer la double authentification' })
  @Patch('me/preferences/tfa')
  async toggleTfa(
    @CurrentUser() user: ActiveUser,
    @Body() body: { value: boolean },
  ) {
    return this.userRepository.savePreferences(user.userId, { twoFactorEnabled: body.value });
  }

  @ApiOperation({ summary: "Définir le type d'investisseur (PP ou PM)" })
  @ApiResponse({ status: 200, description: 'Type mis à jour' })
  @Patch('me/type')
  async setUserType(
    @CurrentUser() user: ActiveUser,
    @Body() body: { userType: UserType },
  ) {
    if (!Object.values(UserType).includes(body.userType)) {
      throw new BadRequestException('Type invalide : PP ou PM attendu.');
    }
    const found = await this.userRepository.findById(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');
    (found as any).userType = body.userType;
    const updated = await this.userRepository.update(found);
    const { password: _p, ...safe } = updated as any;
    return safe;
  }

  @ApiOperation({ summary: 'Obtenir un utilisateur par ID (soi-même ou admin)' })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Utilisateur + KYC + wallet retournés' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    const isSelf = currentUser.userId === id;
    const canRead = isSelf || (await this.hasRole(currentUser.userId, READ_ROLES));
    if (!canRead) throw new ForbiddenException('Accès refusé.');

    const found = await this.userRepository.findById(id);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    const [kyc, wallet] = await Promise.all([
      this.profilRepository.findKycByUserId(id).catch(() => null),
      this.walletRepository.findWalletByUser(id, WalletType.INVESTISSEUR).catch(() => null),
    ]);

    const { password: _p, ...safe } = found as any;
    return { ...safe, kyc: kyc ?? null, wallet: wallet ?? null };
  }

  @ApiOperation({ summary: 'Mettre à jour un utilisateur (admin seulement)' })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur cible" })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour' })
  @ApiResponse({ status: 403, description: 'Accès refusé — rôle admin requis' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
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
    if (dto.firstname !== undefined && dto.firstname !== found.firstname) {
      found.firstname = dto.firstname;
      changed.push('firstname');
    }
    if (dto.lastname !== undefined && (dto.lastname ?? null) !== (found.lastname ?? null)) {
      found.lastname = dto.lastname ?? null;
      changed.push('lastname');
    }
    if (dto.status !== undefined && dto.status !== (found as any).status) {
      (found as any).status = dto.status;
      changed.push('status');
    }

    const updated = await this.userRepository.update(found);
    if (changed.length > 0 && id !== currentUser.userId) {
      this.notificationEvents.profileUpdatedByAdmin(id, changed, currentUser.userId);
    }
    const { password: _p, ...safe } = updated as any;
    return safe;
  }

  @ApiOperation({ summary: 'Supprimer mon compte (soft-delete après confirmation de mot de passe)' })
  @ApiResponse({ status: 204, description: 'Compte supprimé' })
  @ApiResponse({ status: 401, description: 'Mot de passe incorrect' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  async deleteMe(
    @CurrentUser() user: ActiveUser,
    @Body() dto: DeleteAccountDto,
  ) {
    const found = await this.userRepository.findById(user.userId);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    const passwordHash = (found as any).password;
    if (!passwordHash) throw new UnauthorizedException('Confirmation impossible.');

    const valid = await this.hashingService.compare(dto.password, passwordHash);
    if (!valid) throw new UnauthorizedException('Mot de passe incorrect.');

    (found as any).status = UserStatus.SUPPRIME;
    await this.userRepository.update(found);

    this.notificationEvents.accountDeletedByUser(found);
  }
}
