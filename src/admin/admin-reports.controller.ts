import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import {
  UserEntity,
  UserRole,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import PDFDocument = require('pdfkit');

const ADMIN_ROLES: string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.FINANCIER,
  UserRole.RCCI,
  UserRole.COMPLIANCE,
];

const REPORT_TYPES = ['monthly', 'investors', 'ifu', 'amf', 'aml'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const REPORT_LABEL: Record<ReportType, string> = {
  monthly: 'Rapport mensuel',
  investors: 'Liste investisseurs',
  ifu: 'IFU (Imprimé Fiscal Unique)',
  amf: 'Reporting AMF',
  aml: 'Rapport AML',
};

@ApiTags('Admin – Reports')
@ApiBearerAuth()
@Controller('admin/reports')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.RCCI, UserRole.COMPLIANCE)
export class AdminReportsController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
  ) {}

  private async ensureAdmin(currentUser: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: currentUser.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role)) throw new ForbiddenException();
  }

  @ApiOperation({ summary: 'Liste des types de rapports disponibles' })
  @Get()
  async list(@CurrentUser() user: ActiveUser) {
    await this.ensureAdmin(user);
    return REPORT_TYPES.map((type) => ({
      id: type,
      type,
      label: REPORT_LABEL[type],
      downloadUrl: `/admin/reports/${type}/download`,
    }));
  }

  @ApiOperation({
    summary: 'Télécharger un rapport (alias de generate, identifié par son id/type)',
    description: 'Les rapports BeOwn sont générés à la volée — :id correspond donc au type de rapport.',
  })
  @ApiResponse({ status: 200, description: 'PDF binary stream' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
    @Res() res: Response,
  ) {
    return this.generate(id, user, res);
  }

  @ApiOperation({ summary: 'Générer et télécharger un rapport PDF' })
  @ApiResponse({ status: 200, description: 'PDF binary stream' })
  @Post(':type/generate')
  @Get(':type/generate')
  async generate(
    @Param('type') type: string,
    @CurrentUser() user: ActiveUser,
    @Res() res: Response,
  ) {
    await this.ensureAdmin(user);
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new ForbiddenException(`Type de rapport inconnu : ${type}`);
    }
    const reportType = type as ReportType;

    const filename = `beown-${reportType}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    doc.pipe(res);

    // Header
    doc
      .fontSize(20)
      .fillColor('#1A2E35')
      .text('BeOwn', { continued: true })
      .fillColor('#FFB52E')
      .text(' — ' + REPORT_LABEL[reportType]);
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor('#94a3b8')
      .text(
        `Généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${new Date().toLocaleTimeString('fr-FR')}`,
      );
    doc.moveDown(1.5);

    // Body — varies per type
    switch (reportType) {
      case 'monthly': {
        const since = new Date();
        since.setMonth(since.getMonth() - 1);
        const recent = await this.investRepo
          .createQueryBuilder('i')
          .where('i.createdAt >= :since', { since })
          .getMany();
        const totalAmount = recent.reduce(
          (s, i) => s + Number(i.montant),
          0,
        );
        doc.fontSize(11).fillColor('#0f172a').text(
          `Période : ${since.toLocaleDateString('fr-FR')} → ${new Date().toLocaleDateString('fr-FR')}`,
        );
        doc.moveDown(0.5);
        doc.fontSize(11).text(`Investissements sur la période : ${recent.length}`);
        doc.text(`Montant total : ${totalAmount.toLocaleString('fr-FR')} XOF`);
        break;
      }
      case 'investors': {
        const investors = await this.userRepo
          .createQueryBuilder('u')
          .where('u.role = :r', { r: UserRole.INVESTISSEUR })
          .getMany();
        doc.fontSize(11).text(`Total investisseurs : ${investors.length}`);
        doc.moveDown(0.5);
        for (const u of investors.slice(0, 80)) {
          doc.fontSize(9).text(
            `#${u.userId} — ${u.firstname ?? ''} ${u.lastname ?? ''}`.trim(),
          );
        }
        if (investors.length > 80) {
          doc
            .moveDown(0.5)
            .fontSize(9)
            .fillColor('#94a3b8')
            .text(`… et ${investors.length - 80} autres.`);
        }
        break;
      }
      case 'ifu':
      case 'amf':
      case 'aml': {
        doc.fontSize(11).text(
          `Ce rapport est généré en mode démonstration. Pour la version réglementaire complète, un connecteur dédié devra être branché ` +
            `(récupération exhaustive des données, formatage selon le cahier des charges ${reportType.toUpperCase()}, signature électronique, etc.).`,
          { align: 'justify' },
        );
        break;
      }
    }

    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text('Document confidentiel — usage interne BeOwn.', {
        align: 'center',
      });

    doc.end();
  }
}
