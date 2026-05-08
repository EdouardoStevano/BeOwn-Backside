import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserType } from 'src/users/infrastructure/persistences/entities/user.entity';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from 'src/users/applications/users.service';
import { RegisterDto, UpdateUserDto, UpdateUserAdminDto } from '../dto/user.dto';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
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

const ADMIN_ROLES: string[] = [
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.COMPLIANCE,
  UserRole.FINANCIER,
  UserRole.RCCI,
];

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
  ) {}

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async isAdmin(userId: number): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    return ADMIN_ROLES.includes((user as any)?.role ?? '');
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
    const kycStatut = kyc?.statut ?? null;
    let completionStep = 0;
    if (userSafe.userType) completionStep = 1;
    if (profilPP || profilPM) completionStep = 2;
    if (kycStatut && kycStatut !== 'non_demarre') completionStep = 3;
    if (kycStatut === 'valide') completionStep = 4;

    return {
      ...userSafe,
      profilPP: profilPP ?? null,
      profilPM: profilPM ?? null,
      kyc: kyc ?? null,
      wallet: wallet ?? null,
      documents,
      completionStep,
      isProfileComplete: completionStep >= 4,
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
    const admin = isSelf ? false : await this.isAdmin(currentUser.userId);
    if (!isSelf && !admin) throw new ForbiddenException('Accès refusé.');

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
  @Patch(':id')
  async updateById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: ActiveUser,
    @Body() dto: UpdateUserAdminDto,
  ) {
    if (!(await this.isAdmin(currentUser.userId))) {
      throw new ForbiddenException('Accès réservé aux administrateurs.');
    }
    const found = await this.userRepository.findById(id);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');

    if (dto.firstname !== undefined) found.firstname = dto.firstname;
    if (dto.lastname !== undefined) found.lastname = dto.lastname ?? null;
    if (dto.role !== undefined) (found as any).role = dto.role;
    if (dto.status !== undefined) (found as any).status = dto.status;

    const updated = await this.userRepository.update(found);
    const { password: _p, ...safe } = updated as any;
    return safe;
  }
}
