import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CloudStorageService } from 'src/common/cloud-storage/cloud-storage.service';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from 'src/common/auth/public.decorator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { NewsEntity, NewsStatus } from './news.entity';

const ADMIN_ROLES: string[] = rolesWithPermission('news:manage');

class CreateNewsDto {
  @ApiProperty({ example: "Lancement de la plateforme BeOwn" })
  @IsString()
  @IsNotEmpty()
  titreFr: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titreEn?: string;

  @ApiProperty({ example: "<p>Contenu…</p>" })
  @IsString()
  @IsNotEmpty()
  contenuFr: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contenuEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resumeFr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resumeEn?: string;

  @ApiPropertyOptional({ description: "Hero image (1ère image, conservée pour compat)" })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Liste complète des images (URLs Cloudinary)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: NewsStatus })
  @IsOptional()
  @IsEnum(NewsStatus)
  statut?: NewsStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;
}

class UpdateNewsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titreFr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titreEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contenuFr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contenuEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resumeFr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resumeEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: NewsStatus })
  @IsOptional()
  @IsEnum(NewsStatus)
  statut?: NewsStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `news-${Date.now()}`;

// ────────────────────────────────────────────────────────────────────────────
// Public read-only endpoints

@ApiTags('News (public)')
@Controller('news')
export class PublicNewsController {
  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepo: Repository<NewsEntity>,
  ) {}

  @ApiOperation({ summary: 'Liste publique des actualités publiées' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'category', required: false })
  @Public()
  @Get()
  async listPublic(
    @Query('limit') limit = '20',
    @Query('category') category?: string,
  ) {
    const qb = this.newsRepo
      .createQueryBuilder('n')
      .where('n.statut = :s', { s: NewsStatus.PUBLISHED })
      .orderBy('n.publishedAt', 'DESC')
      .take(Math.min(100, Number(limit) || 20));
    if (category) qb.andWhere('n.category = :c', { c: category });
    return qb.getMany();
  }

  @ApiOperation({ summary: 'Détail public d\'une actualité' })
  @Public()
  @Get(':slug')
  async detailPublic(@Param('slug') slug: string) {
    const n = await this.newsRepo.findOne({
      where: { slug, statut: NewsStatus.PUBLISHED },
    });
    if (!n) throw new NotFoundException('Actualité introuvable.');
    return n;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Admin CRUD

const NEWS_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const NEWS_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('Admin – News')
@ApiBearerAuth()
@Controller('admin/news')
@UseGuards(JwtAuthGuard)
@RequirePermission('news:manage')
export class AdminNewsController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(NewsEntity)
    private readonly newsRepo: Repository<NewsEntity>,
    private readonly cloudStorage: CloudStorageService,
  ) {}

  private async ensureAdmin(currentUser: ActiveUser): Promise<UserEntity> {
    const u = await this.userRepo.findOne({ where: { userId: currentUser.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role)) throw new ForbiddenException();
    return u;
  }

  @ApiOperation({ summary: "Uploader une image pour une actualité (cover)" })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'URL Cloudinary du fichier uploadé' })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: NEWS_IMAGE_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (NEWS_IMAGE_MIME.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Formats acceptés : JPEG, PNG, WEBP'), false);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ActiveUser,
  ): Promise<{ url: string }> {
    await this.ensureAdmin(user);
    if (!file) throw new BadRequestException('Fichier manquant.');
    const { publicUrl } = await this.cloudStorage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      'news',
    );
    return { url: publicUrl };
  }

  @ApiOperation({ summary: 'Lister toutes les actualités (admin)' })
  @Get()
  async list(@CurrentUser() user: ActiveUser) {
    await this.ensureAdmin(user);
    return this.newsRepo.find({ order: { updatedAt: 'DESC' } });
  }

  @ApiOperation({ summary: 'Détail d\'une actualité (admin)' })
  @Get(':id')
  async detail(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.ensureAdmin(user);
    const n = await this.newsRepo.findOne({ where: { id } });
    if (!n) throw new NotFoundException();
    return n;
  }

  @ApiOperation({ summary: 'Créer une actualité' })
  @Post()
  async create(
    @Body() dto: CreateNewsDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const u = await this.ensureAdmin(user);
    const slug = dto.slug || slugify(dto.titreFr);
    const exists = await this.newsRepo.findOne({ where: { slug } });
    const finalSlug = exists ? `${slug}-${Date.now().toString(36)}` : slug;

    const imageUrls = dto.imageUrls ?? (dto.imageUrl ? [dto.imageUrl] : []);
    const imageUrl = dto.imageUrl ?? imageUrls[0] ?? null;

    const news = this.newsRepo.create({
      ...dto,
      imageUrl,
      imageUrls,
      slug: finalSlug,
      authorId: u.userId,
      publishedAt:
        dto.statut === NewsStatus.PUBLISHED
          ? dto.publishedAt
            ? new Date(dto.publishedAt)
            : new Date()
          : null,
      statut: dto.statut ?? NewsStatus.DRAFT,
    });
    return this.newsRepo.save(news);
  }

  @ApiOperation({ summary: 'Mettre à jour une actualité' })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNewsDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureAdmin(user);
    const existing = await this.newsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();

    const wasPublished = existing.statut === NewsStatus.PUBLISHED;
    const willBePublished =
      (dto.statut ?? existing.statut) === NewsStatus.PUBLISHED;

    const patch: Partial<NewsEntity> = { ...dto } as Partial<NewsEntity>;
    if (!wasPublished && willBePublished && !dto.publishedAt) {
      patch.publishedAt = new Date();
    } else if (dto.publishedAt) {
      patch.publishedAt = new Date(dto.publishedAt);
    }
    if (dto.titreFr && !dto.slug && existing.slug === slugify(existing.titreFr)) {
      // Resync slug if user didn't customize it
      patch.slug = slugify(dto.titreFr);
    }

    // Keep imageUrl in sync with imageUrls[0] for backward compatibility
    if (dto.imageUrls) {
      patch.imageUrl = dto.imageUrls[0] ?? null;
    } else if (dto.imageUrl !== undefined && !dto.imageUrls) {
      patch.imageUrls = dto.imageUrl ? [dto.imageUrl] : [];
    }

    await this.newsRepo.update({ id }, patch);
    return this.newsRepo.findOne({ where: { id } });
  }

  @ApiOperation({ summary: 'Supprimer une actualité' })
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.ensureAdmin(user);
    await this.newsRepo.delete({ id });
    return { id, deleted: true };
  }
}
