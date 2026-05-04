import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from 'src/users/applications/users.service';
import { RegisterDto, UpdateUserDto } from '../dto/user.dto';
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

  @ApiOperation({ summary: 'Créer un nouveau compte utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @Post()
  register(@Body() dto: RegisterDto) {
    return this.usersService.create(dto);
  }

  @ApiOperation({ summary: 'Mon profil complet (page Profil)' })
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
    return {
      ...userSafe,
      profilPP: profilPP ?? null,
      profilPM: profilPM ?? null,
      kyc: kyc ?? null,
      wallet: wallet ?? null,
      documents,
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

  @ApiOperation({ summary: 'Obtenir un utilisateur par ID (admin)' })
  @ApiParam({ name: 'id', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Utilisateur retourné' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const found = await this.userRepository.findById(id);
    if (!found) throw new NotFoundException('Utilisateur introuvable.');
    const { password: _p, ...safe } = found as any;
    return safe;
  }
}
