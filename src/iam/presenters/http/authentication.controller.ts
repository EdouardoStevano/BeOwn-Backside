import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { SignInUsecase } from '../../applications/usecases/sign-in.usecase';
import { RefreshTokenUseCase } from '../../applications/usecases/refresh-token.usecase';
import { IssueOAuthCodeUseCase } from '../../applications/usecases/issue-oauth-code.usecase';
import { ExchangeOAuthCodeUseCase } from '../../applications/usecases/exchange-oauth-code.usecase';
import { ForgotPasswordUseCase } from '../../applications/usecases/forgot-password.usecase';
import { ResetPasswordUseCase } from '../../applications/usecases/reset-password.usecase';
import { RegisterUseCase } from '../../applications/usecases/register.usecase';
import { SendEmailVerificationUseCase } from '../../applications/usecases/send-email-verification.usecase';
import { ConfirmEmailUseCase } from '../../applications/usecases/confirm-email.usecase';
import { CreateEmailOtpUseCase } from '../../applications/usecases/create-email-otp.usecase';
import { CreateSmsOtpUseCase } from '../../applications/usecases/create-sms-otp.usecase';
import { EnrollTfaUseCase } from '../../applications/usecases/enroll-tfa.usecase';
import { EnableMfaUseCase } from '../../applications/usecases/enable-mfa.usecase';
import { DisableMfaUseCase } from '../../applications/usecases/disable-mfa.usecase';
import { VerifyMfaChallengeUseCase } from '../../applications/usecases/verify-mfa-challenge.usecase';
import { FacebookAuthGuard } from '../guards/facebook-auth.guard';
import { FacebookCallbackGuard } from '../guards/facebook-callback.guard';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import { GoogleCallbackGuard } from '../guards/google-callback.guard';
import { LinkedinAuthGuard } from '../guards/linkedin-auth.guard';
import { LinkedinCallbackGuard } from '../guards/linkedin-callback.guard';
import type { AuthenticatedSocialUser } from '../guards/oauth-redirect-cookie';
import { SignInDto } from './dto/sign-in.dto';
import { ExchangeCodeDto, RefreshTokenDto } from './dto/refresh-token.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SignUpDto,
} from './dto/password.dto';
import { EmailVerificationDto } from './dto/email-verification.dto';
import {
  SendEmailOtpDto,
  SendSmsOtpDto,
  VerifyEmailOtpDto,
  VerifySmsOtpDto,
} from './dto/otp.dto';
import {
  DisableMfaChallengeDto,
  DisableMfaDto,
  EnableMfaDto,
  EnrollMfaDto,
  MfaChallengeDto,
  MfaEnrollmentChallengeDto,
  MfaMethodResponseDto,
} from './dto/mfa.dto';
import { emailVerifiedPage } from './views/email-verified.view';

/**
 * Adapter d'entrée unique du parcours d'authentification : mot de passe, OAuth
 * social, vérification d'adresse email, OTP de connexion et enrôlement 2FA.
 *
 * Ces routes étaient réparties sur trois préfixes (`/auth`, `/email`, `/otp`)
 * servis par trois contrôleurs ; elles vivent désormais toutes sous `/auth`,
 * comme les use cases qu'elles appellent vivent tous dans la même feature.
 * Attention : c'est un changement cassant côté clients (§ voir le commentaire
 * de `NestAuthMailerAdapter` pour les liens déjà envoyés par email).
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly signInUsecase: SignInUsecase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly issueOAuthCodeUseCase: IssueOAuthCodeUseCase,
    private readonly exchangeOAuthCodeUseCase: ExchangeOAuthCodeUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly registerUseCase: RegisterUseCase,
    private readonly recaptchaService: RecaptchaService,
    private readonly sendEmailVerificationUseCase: SendEmailVerificationUseCase,
    private readonly confirmEmailUseCase: ConfirmEmailUseCase,
    private readonly emailOtpUseCase: CreateEmailOtpUseCase,
    private readonly smsOtpUseCase: CreateSmsOtpUseCase,
    private readonly enrollTfaUseCase: EnrollTfaUseCase,
    private readonly enableMfaUseCase: EnableMfaUseCase,
    private readonly disableMfaUseCase: DisableMfaUseCase,
    private readonly verifyMfaChallengeUseCase: VerifyMfaChallengeUseCase,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Connexion, inscription, mot de passe
  // ─────────────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Connexion avec email et mot de passe',
    description:
      '**Deux réponses possibles en 200**, à distinguer par la présence de `mfaRequired` :\n\n' +
      '- compte sans facteur actif → `{ accessToken, refreshToken, user }` ;\n' +
      '- compte avec facteur actif → `{ mfaRequired: true, challengeId, method, sentTo }`, **sans aucun token ni profil**. La connexion se termine par `POST /auth/mfa/challenge`.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Session ouverte (accessToken, refreshToken, user), ou défi MFA à relever (`mfaRequired`)',
  })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({
    status: 429,
    description: 'Trop de tentatives — réessayez dans 15 min',
  })
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() dto: SignInDto) {
    return this.signInUsecase.execute(dto);
  }

  @ApiOperation({ summary: 'Inscription (sign-up)' })
  @ApiResponse({
    status: 201,
    description:
      "Compte créé avec succès (statut CREE). Un email contenant le lien de vérification part automatiquement ; il mène à GET /auth/email/verify?token=… qui fait passer le compte à EMAIL_VERIFIE. En cas d'échec d'envoi, l'inscription réussit tout de même et le lien peut être redemandé via POST /auth/email/send-verification.",
  })
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Public()
  @Post('sign-up')
  async signUp(@Body() dto: SignUpDto) {
    await this.recaptchaService.verify(dto.captchaToken);
    const user = await this.registerUseCase.execute(dto);
    // `toJSON()` exclut l'empreinte du mot de passe — l'ancien étalement
    // exposerait désormais le champ privé `_passwordHash`.
    return user.toJSON();
  }

  @ApiOperation({ summary: "Rafraîchir les tokens d'accès" })
  @ApiResponse({
    status: 200,
    description:
      'Nouveaux tokens (accessToken, refreshToken) accompagnés du compte (user) — même forme de réponse que sign-in.',
  })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.refreshTokenUseCase.execute(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Mot de passe oublié' })
  @ApiResponse({
    status: 204,
    description: 'Email de réinitialisation envoyé si le compte existe',
  })
  @Throttle({ auth: { ttl: 3_600_000, limit: 50 } })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.forgotPasswordUseCase.execute(dto.email);
  }

  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiResponse({
    status: 200,
    description: 'Mot de passe réinitialisé avec succès',
  })
  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.resetPasswordUseCase.execute(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth social
  // ─────────────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Authentification via Facebook' })
  @Public()
  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookAuthenticate() {}

  @ApiOperation({ summary: 'Callback Facebook OAuth' })
  @Public()
  @Get('facebook/callback')
  @UseGuards(FacebookCallbackGuard)
  facebookCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as AuthenticatedSocialUser);
  }

  @ApiOperation({ summary: 'Authentification via Google' })
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuthenticate() {}

  @ApiOperation({ summary: 'Callback Google OAuth' })
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleCallbackGuard)
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as AuthenticatedSocialUser);
  }

  @ApiOperation({ summary: 'Authentification via LinkedIn' })
  @Public()
  @Get('linkedin')
  @UseGuards(LinkedinAuthGuard)
  linkedinAuthenticate() {}

  @ApiOperation({ summary: 'Callback LinkedIn OAuth' })
  @Public()
  @Get('linkedin/callback')
  @UseGuards(LinkedinCallbackGuard)
  linkedinCallback(@Req() req: Request, @Res() res: Response) {
    return this.redirectWithCode(res, req.user as AuthenticatedSocialUser);
  }

  @ApiOperation({
    summary: 'Échange un code OAuth contre des tokens (usage unique, 30s)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Session ouverte : accessToken, refreshToken et le compte (user)',
  })
  @ApiResponse({ status: 401, description: 'Code invalide ou expiré' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('exchange')
  exchange(@Body() dto: ExchangeCodeDto) {
    return this.exchangeOAuthCodeUseCase.execute(dto.code);
  }

  /**
   * Seule responsabilité restante côté présentation : choisir l'URL de retour
   * (front vs back-office) et rediriger. L'authentification et l'émission du
   * code à usage unique appartiennent à `IssueOAuthCodeUseCase`.
   */
  private async redirectWithCode(
    res: Response,
    user: AuthenticatedSocialUser | undefined,
  ) {
    const target =
      user?._redirectTo === 'admin'
        ? (process.env.ADMIN_URL ?? 'http://localhost:5174')
        : (process.env.FRONTEND_URL ?? 'http://localhost:5173');

    if (!user) {
      return res.redirect(
        `${target}/auth/oauth-callback?error=${encodeURIComponent('Connexion annulée ou refusée')}`,
      );
    }

    try {
      const { code, isNewUser } =
        await this.issueOAuthCodeUseCase.execute(user);
      return res.redirect(
        `${target}/auth/oauth-callback?code=${code}&isNewUser=${isNewUser ? '1' : '0'}`,
      );
    } catch {
      return res.redirect(
        `${target}/auth/oauth-callback?error=${encodeURIComponent('Authentification échouée')}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Vérification d'adresse email (lien à usage unique)
  // ─────────────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Envoyer un email de vérification' })
  @ApiResponse({
    status: 204,
    description:
      'Email envoyé (réponse générique, que le compte existe ou non)',
  })
  @ApiResponse({
    status: 429,
    description: 'Trop de demandes — réessayez plus tard',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email/send-verification')
  sendVerification(@Body() dto: EmailVerificationDto) {
    return this.sendEmailVerificationUseCase.execute(dto.email);
  }

  @ApiOperation({ summary: 'Confirmer un email via token' })
  @ApiResponse({ status: 200, description: 'Email confirmé' })
  @Public()
  @Get('email/verify')
  async confirmEmail(@Query('token') token: string) {
    const { email } = await this.confirmEmailUseCase.execute(token);
    return emailVerifiedPage(email);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OTP de connexion (email, SMS)
  // ─────────────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Envoyer un OTP par email' })
  @ApiResponse({ status: 204, description: 'OTP envoyé' })
  @ApiResponse({
    status: 429,
    description: 'Trop de demandes — réessayez plus tard',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('otp/email/send')
  sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.emailOtpUseCase.send(dto.email);
  }

  @ApiOperation({ summary: "Vérifier l'OTP email" })
  @ApiResponse({ status: 200, description: 'OTP valide ou invalide' })
  @Public()
  @Post('otp/email/verify')
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.emailOtpUseCase.verify(dto.email, dto.otp);
  }

  @ApiOperation({ summary: 'Envoyer un OTP par SMS' })
  @ApiResponse({ status: 204, description: 'SMS envoyé' })
  @ApiResponse({
    status: 429,
    description: 'Trop de demandes — réessayez plus tard',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('otp/sms/send')
  sendSmsOtp(@Body() dto: SendSmsOtpDto) {
    return this.smsOtpUseCase.send(dto.phone);
  }

  @ApiOperation({ summary: "Vérifier l'OTP SMS" })
  @ApiResponse({ status: 200, description: 'OTP valide' })
  @Public()
  @Post('otp/sms/verify')
  verifySmsOtp(@Body() dto: VerifySmsOtpDto) {
    return this.smsOtpUseCase.verify(dto.phone, dto.otp);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Double authentification (MFA) — enrôlement, activation, retrait, défi
  // ─────────────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Démarrer un enrôlement MFA',
    description:
      "Le canal est choisi dans le body (`method`) : `totp` renvoie le secret et l'URI du QR code, `email` et `sms` envoient un code.\n\n" +
      "**`credential`** porte la destination : numéro E.164 pour `sms`. Il est ignoré pour `totp` (aucune destination) et pour `email`, qui envoie toujours à l'adresse du compte — accepter une adresse arbitraire permettrait de déplacer le second facteur vers une boîte tierce depuis une simple session valide.\n\n" +
      'Le facteur reste **inactif** tant que `POST /auth/mfa/enable` ne l’a pas confirmé : tant qu’il l’est, il ne sera pas opposé à la connexion.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 201,
    description: 'Défi émis (secret TOTP, ou code envoyé au canal)',
    type: MfaEnrollmentChallengeDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Canal inconnu, `credential` manquant ou hors format E.164, ou code déjà actif sur ce canal (attendre le TTL)',
  })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  @ApiResponse({
    status: 409,
    description:
      "Canal `email`/`sms` déjà enrôlé et actif sur cette destination. `totp` n'est pas concerné : un nouvel enrôlement y est toujours accepté (changement d'appareil) et remplace le précédent à l'activation.",
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Post('mfa/enroll')
  enrollMfa(@Body() dto: EnrollMfaDto, @CurrentUser() user: ActiveUser) {
    return this.enrollTfaUseCase.start({
      method: dto.method,
      userId: user.userId,
      email: user.email,
      // Seul le canal SMS lit cette valeur ; les autres résolvent leur
      // destination eux-mêmes.
      phone: dto.credential,
    });
  }

  @ApiOperation({
    summary: 'Activer le facteur enrôlé',
    description:
      'Prouve la possession du facteur ; il devient alors la méthode active de son canal — les méthodes précédentes du **même** canal sont désactivées, les autres canaux ne sont pas touchés.\n\n' +
      "Le body ne porte **pas** de `method` : le canal est déduit de l'enrôlement en attente, l'appelant venant d'appeler `/auth/mfa/enroll`. Le canal effectivement activé est renvoyé.\n\n" +
      "Ce code est cloisonné des OTP de connexion : un code d'enrôlement ne peut pas ouvrir de session.",
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Facteur activé',
    type: MfaMethodResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Code invalide ou expiré' })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  @ApiResponse({
    status: 404,
    description:
      'Aucun enrôlement en cours — appeler `POST /auth/mfa/enroll` au préalable',
  })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/enable')
  async enableMfa(@Body() dto: EnableMfaDto, @CurrentUser() user: ActiveUser) {
    const method = await this.enableMfaUseCase.execute({
      userId: user.userId,
      code: dto.code,
    });

    return { method };
  }

  @ApiOperation({
    summary: 'Retirer le facteur MFA',
    description:
      "Deux temps sur la même route, parce que retirer une protection vaut au moins autant que ce qu'elle protège : une session volée suffirait sinon à désarmer le compte.\n\n" +
      '1. Body **vide** (ou `method` seul) → un code part sur le canal actif et un `challengeId` est renvoyé. Pour `totp`, rien n’est envoyé : le code est lu dans l’application.\n' +
      '2. Body `{ challengeId, code }` → le facteur est retiré.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description:
      'Premier appel : défi émis. Second appel : facteur retiré (`{ method }`).',
    type: DisableMfaChallengeDto,
  })
  @ApiResponse({ status: 400, description: 'Code invalide ou expiré' })
  @ApiResponse({
    status: 401,
    description: 'Authentification requise, ou challenge inconnu/expiré/épuisé',
  })
  @ApiResponse({
    status: 404,
    description: "Aucun facteur actif sur ce compte — il n'y a rien à retirer",
  })
  @Throttle({
    short: { ttl: 60_000, limit: 5 },
    medium: { ttl: 60_000, limit: 5 },
    auth: { ttl: 60_000, limit: 5 },
  })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/disable')
  async disableMfa(
    @Body() dto: DisableMfaDto,
    @CurrentUser() user: ActiveUser,
  ) {
    // `challengeId` absent = premier temps. La distinction est portée par le
    // body et non par deux routes, pour tenir le contrat demandé
    // (`{ challengeId, code }`) sans ajouter d'endpoint d'émission.
    if (!dto.challengeId) {
      return this.disableMfaUseCase.request({
        userId: user.userId,
        method: dto.method,
      });
    }

    const method = await this.disableMfaUseCase.confirm({
      userId: user.userId,
      challengeId: dto.challengeId,
      code: dto.code as string,
    });

    return { method };
  }

  @ApiOperation({
    summary: 'Relever le défi MFA et terminer la connexion',
    description:
      'Second temps de `POST /auth/sign-in` lorsque le compte a un facteur actif : celui-ci renvoie alors `{ mfaRequired: true, challengeId, method, sentTo }` **au lieu** des tokens.\n\n' +
      "La route est publique — c'est justement la connexion qui n'est pas terminée. Le `challengeId` accompagne le code parce que rien d'autre ne dit au serveur quel compte est en jeu ; il n'est émis qu'après un mot de passe valide, expire au bout de 5 minutes et ne tolère que 3 essais.",
  })
  @ApiResponse({
    status: 200,
    description: 'Facteur prouvé — tokens et profil délivrés',
  })
  @ApiResponse({ status: 400, description: 'Code invalide ou expiré' })
  @ApiResponse({
    status: 401,
    description:
      'Challenge inconnu, expiré ou épuisé — reprendre à `POST /auth/sign-in`',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 5 },
    medium: { ttl: 60_000, limit: 5 },
    auth: { ttl: 60_000, limit: 5 },
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('mfa/challenge')
  verifyMfaChallenge(@Body() dto: MfaChallengeDto) {
    return this.verifyMfaChallengeUseCase.execute({
      challengeId: dto.challengeId,
      code: dto.code,
    });
  }
}
