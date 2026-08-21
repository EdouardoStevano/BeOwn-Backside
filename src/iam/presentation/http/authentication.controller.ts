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
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { NO_MFA } from 'src/iam/domain/mappers/user.mapper';
import { SignInUsecase } from '../../application/usecases/sign/sign-in.usecase';
import { RefreshTokenUseCase } from '../../application/usecases/token/refresh-token.usecase';
import { IssueOAuthCodeUseCase } from '../../application/usecases/oauth/issue-oauth-code.usecase';
import { ExchangeOAuthCodeUseCase } from '../../application/usecases/oauth/exchange-oauth-code.usecase';
import { ForgotPasswordUseCase } from '../../application/usecases/password/forgot-password.usecase';
import { ResetPasswordUseCase } from '../../application/usecases/password/reset-password.usecase';
import { RegisterUseCase } from '../../application/usecases/sign/register.usecase';
import { SendEmailVerificationUseCase } from '../../application/usecases/email/send-email-verification.usecase';
import { ConfirmEmailUseCase } from '../../application/usecases/email/confirm-email.usecase';
import { EnrollMfaUseCase } from '../../application/usecases/mfa/enroll-mfa.usecase';
import { ListMfaMethodsUseCase } from '../../application/usecases/mfa/list-mfa-methods.usecase';
import { EnableMfaUseCase } from '../../application/usecases/mfa/enable-mfa.usecase';
import { DisableMfaUseCase } from '../../application/usecases/mfa/disable-mfa.usecase';
import { CompleteMfaSignInUseCase } from '../../application/usecases/mfa/complete-mfa-sign-in.usecase';
import { ResendMfaChallengeUseCase } from '../../application/usecases/mfa/resend-mfa-challenge.usecase';
import { MfaChallengePurpose } from '../../application/dto/mfa-challenge';
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
  DisableMfaDto,
  EnableMfaDto,
  EnrollMfaDto,
  MfaChallengeDto,
  MfaChallengeIssuedDto,
  MfaEnrollmentChallengeDto,
  MfaMethodResponseDto,
  MfaMethodSummaryDto,
  MfaRequiredErrorDto,
  RequestDisableMfaDto,
  ResendMfaChallengeDto,
} from './dto/mfa.dto';
import { emailVerifiedPage } from './views/email-verified.view';

/**
 * Adapter d'entrée unique du parcours d'authentification : mot de passe, OAuth
 * social, vérification d'adresse email et double authentification.
 *
 * Ces routes étaient réparties sur trois préfixes (`/auth`, `/email`, `/otp`)
 * servis par trois contrôleurs ; elles vivent désormais toutes sous `/auth`,
 * comme les use cases qu'elles appellent vivent tous dans la même feature.
 *
 * `/auth/otp/**` a été retiré : ces quatre routes envoyaient et vérifiaient un
 * code par email ou SMS **hors** de tout parcours — sans mot de passe préalable
 * ni session, et sans rien ouvrir en cas de succès. Le second facteur passe
 * désormais entièrement par `/auth/mfa/**` et `/auth/sign-in/mfa`, qui
 * rattachent chaque code à un compte et à une finalité.
 * Attention : c'est un changement cassant côté clients (§ voir le commentaire
 * d'`AuthMailerService.sendEmailVerificationLink` pour les liens déjà envoyés
 * par email).
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
    private readonly enrollMfaUseCase: EnrollMfaUseCase,
    private readonly listMfaMethodsUseCase: ListMfaMethodsUseCase,
    private readonly enableMfaUseCase: EnableMfaUseCase,
    private readonly disableMfaUseCase: DisableMfaUseCase,
    private readonly completeMfaSignInUseCase: CompleteMfaSignInUseCase,
    private readonly resendMfaChallengeUseCase: ResendMfaChallengeUseCase,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Connexion, inscription, mot de passe
  // ─────────────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Connexion avec email et mot de passe',
    description:
      '**Un 200 signifie toujours session ouverte** : `{ accessToken, refreshToken, user }`. Rien à inspecter dans le corps pour le savoir.\n\n' +
      "Si le compte a un facteur actif, la connexion n'est pas terminée : la réponse est un **401 de code `MFA_REQUIRED`** portant `challengeId`, `method` et `sentTo` — **sans aucun token ni profil**. Le défi est déjà émis (le code est parti par email/SMS le cas échéant) ; il reste à le relever sur `POST /auth/sign-in/mfa`.\n\n" +
      "Le front teste donc `code === 'MFA_REQUIRED'` sur le 401 pour distinguer « étape manquante » de « identifiants invalides » (401 sans `code`).\n\n" +
      "`user.mfa` (`{ enabled, method }`) accompagne toute session — ici comme sur `/auth/sign-in/mfa`, `/auth/refresh-tokens` et `/auth/exchange` : le front connaît l'état du second facteur sans appeler `GET /auth/mfa/methods`.",
  })
  @ApiResponse({
    status: 200,
    description: 'Session ouverte (accessToken, refreshToken, user)',
  })
  @ApiResponse({
    status: 401,
    description:
      'Identifiants invalides, **ou** second facteur requis (`code: MFA_REQUIRED`, cf. schéma) — deux cas à distinguer par `code`.',
    type: MfaRequiredErrorDto,
  })
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
    // exposerait désormais le champ privé `_passwordHash`. `NO_MFA` n'est pas
    // une supposition : un compte qui vient de naître n'a aucun facteur.
    return user.toJSON(NO_MFA);
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
  // Double authentification (MFA) — enrôlement, activation, retrait, défi
  // ─────────────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Démarrer un enrôlement MFA',
    description:
      "Le canal est choisi dans le body (`method`) : `totp` renvoie le secret et l'URI du QR code, `email` et `sms` envoient un code.\n\n" +
      "**`credential`** porte la destination : numéro E.164 pour `sms`. Il est ignoré pour `totp` (aucune destination) et pour `email`, qui envoie toujours à l'adresse du compte — accepter une adresse arbitraire permettrait de déplacer le second facteur vers une boîte tierce depuis une simple session valide.\n\n" +
      'Le facteur reste **inactif** tant que `POST /auth/mfa/enable` ne l’a pas confirmé : tant qu’il l’est, il ne sera pas opposé à la connexion.\n\n' +
      '**Redemander un code** se fait en rappelant cette même route : le code précédent est écrasé, l’enrôlement en attente est repris. Le quota de 3 requêtes par minute borne les envois.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 201,
    description: 'Défi émis (secret TOTP, ou code envoyé au canal)',
    type: MfaEnrollmentChallengeDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Canal inconnu, ou `credential` manquant / hors format E.164',
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
    return this.enrollMfaUseCase.start({
      method: dto.method,
      userId: user.userId,
      email: user.email,
      // Seul le canal SMS lit cette valeur ; les autres résolvent leur
      // destination eux-mêmes.
      phone: dto.credential,
    });
  }

  @ApiOperation({
    summary: 'Lister les facteurs enrôlés',
    description:
      "Facteurs du compte appelant, tous canaux confondus. Alimente l'écran de sécurité : quels canaux sont armés, lequel attend encore une confirmation, et sur quelle destination.\n\n" +
      "Aucun secret ne sort d'ici. `totp` ne rend pas de `sentTo` — son `credential` est le secret partagé, qui ne quitte jamais le serveur ; `email`/`sms` rendent une destination **masquée**, suffisante pour reconnaître la sienne sans révéler l'adresse ou le numéro complet à qui détiendrait la session.\n\n" +
      'Les enrôlements non confirmés figurent dans la liste avec `isActive: false` : ils occupent la place du canal jusqu’au prochain `POST /auth/mfa/enroll`.\n\n' +
      'Liste vide si le compte n’a aucun facteur — ce n’est pas une erreur.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Facteurs enrôlés',
    type: [MfaMethodSummaryDto],
  })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  @Get('mfa/methods')
  listMfaMethods(
    @CurrentUser() user: ActiveUser,
  ): Promise<MfaMethodSummaryDto[]> {
    // Le compte est celui du porteur du token, jamais un paramètre : accepter
    // un `userId` ici laisserait n'importe quelle session énumérer les facteurs
    // d'autrui — c'est-à-dire cartographier par quoi les attaquer.
    return this.listMfaMethodsUseCase.execute(user.userId);
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
    summary: 'Demander le défi de retrait du facteur MFA',
    description:
      "Premier temps du retrait. Un code part sur le canal actif et un `challengeId` est renvoyé ; pour `totp`, rien n'est envoyé — le code est lu dans l'application.\n\n" +
      "Le retrait se fait en deux temps parce qu'il vaut au moins autant que ce qu'il protège : une session volée suffirait sinon à désarmer le compte avant d'en prendre le contrôle. On exige donc de prouver une dernière fois le facteur qu'on s'apprête à rendre.\n\n" +
      'Le défi émis ici ne vaut **que** pour `POST /auth/mfa/disable` : il est refusé sur `POST /auth/sign-in/mfa`.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Défi émis — à relever sur `POST /auth/mfa/disable`.',
    type: MfaChallengeIssuedDto,
  })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
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
  @Post('mfa/disable/challenge')
  requestDisableMfa(
    @Body() dto: RequestDisableMfaDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<MfaChallengeIssuedDto> {
    return this.disableMfaUseCase.request({
      userId: user.userId,
      method: dto.method,
    });
  }

  @ApiOperation({
    summary: 'Retirer le facteur MFA',
    description:
      'Second temps du retrait : le code prouve la possession du facteur, qui est alors retiré. Le défi vient de `POST /auth/mfa/disable/challenge` et est consommé — le rejouer échoue.\n\n' +
      'Un défi de connexion présenté ici est refusé, et un défi obtenu sur un autre compte aussi : le `purpose` et le `userId` sont contrôlés séparément.\n\n' +
      'Le défi vit 5 minutes et tolère 3 essais. Code non reçu ? `POST /auth/mfa/disable/resend` en réexpédie un sans toucher au défi. Défi expiré ou essais épuisés : reprendre à `POST /auth/mfa/disable/challenge`.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Facteur retiré (`{ method }`).',
    type: MfaMethodResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Code invalide ou expiré' })
  @ApiResponse({
    status: 401,
    description: 'Authentification requise, ou challenge inconnu/expiré/épuisé',
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
  ): Promise<MfaMethodResponseDto> {
    const method = await this.disableMfaUseCase.confirm({
      userId: user.userId,
      challengeId: dto.challengeId,
      code: dto.code,
    });

    return { method };
  }

  @ApiOperation({
    summary: 'Terminer la connexion avec le second facteur',
    description:
      'Second temps de `POST /auth/sign-in` lorsque le compte a un facteur actif : celui-ci répond alors **401 `MFA_REQUIRED`** avec `{ challengeId, method, sentTo }` au lieu des tokens. Cette route rend enfin `{ accessToken, refreshToken, user }`.\n\n' +
      "C'est la **seule** route qui éprouve le code d'une connexion : il n'existe pas d'étape de vérification préalable, et le défi est consommé ici.\n\n" +
      "La route est publique — c'est justement la connexion qui n'est pas terminée. Le `challengeId` accompagne le code parce que rien d'autre ne dit au serveur quel compte est en jeu ; il n'est émis qu'après un mot de passe valide, expire au bout de 5 minutes et ne tolère que 3 essais.\n\n" +
      "Seul un défi émis par `POST /auth/sign-in` est accepté : un défi de désactivation, obtenu depuis une session déjà établie, n'ouvre pas de session. Le défi est consommé — le rejouer échoue.",
  })
  @ApiResponse({
    status: 200,
    description: 'Facteur prouvé — tokens et profil délivrés',
  })
  @ApiResponse({ status: 400, description: 'Code invalide ou expiré' })
  @ApiResponse({
    status: 401,
    description:
      'Challenge inconnu, expiré, épuisé ou émis pour autre chose — reprendre à `POST /auth/sign-in`. Compte suspendu ou clos entre-temps.',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 5 },
    medium: { ttl: 60_000, limit: 5 },
    auth: { ttl: 60_000, limit: 5 },
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in/mfa')
  completeMfaSignIn(@Body() dto: MfaChallengeDto) {
    return this.completeMfaSignInUseCase.execute({
      challengeId: dto.challengeId,
      code: dto.code,
    });
  }

  @ApiOperation({
    summary: 'Renvoyer le code de la connexion en cours',
    description:
      "« Je n'ai pas reçu le SMS » : réexpédie un code sur le canal du défi, pour les canaux `email` et `sms`.\n\n" +
      '**Le défi ne change pas** : même `challengeId`, mêmes essais restants, même échéance de 5 minutes. Seul le code change — le précédent cesse aussitôt de fonctionner. Le front peut donc garder le `challengeId` qu’il détient.\n\n' +
      "C'est ce qui rend l'opération sûre : le plafond de 3 essais vit sur le défi, qu'on ne touche pas, donc renvoyer un code n'en accorde aucun de plus. Le nombre d'envois est borné à part, par le quota de requêtes (3/min).\n\n" +
      "La route est publique — c'est la connexion qui n'est pas terminée. Le `challengeId` fait office de laissez-passer : il n'a pu être obtenu qu'après un mot de passe valide.\n\n" +
      "`totp` est refusé (400 `MFA_CHALLENGE_NOT_RESENDABLE`) : rien n'est expédié sur ce canal, le code se lit dans l'application. Un défi de désactivation l'est aussi — son titulaire a une session, il rappelle `POST /auth/mfa/disable/challenge`.",
  })
  @ApiResponse({
    status: 200,
    description: 'Nouveau code envoyé — le `challengeId` est inchangé.',
    type: MfaChallengeIssuedDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Canal sans expédition (`totp`) — rien à renvoyer',
  })
  @ApiResponse({
    status: 401,
    description:
      'Défi inconnu, expiré, épuisé, ou émis pour autre chose — reprendre à `POST /auth/sign-in`',
  })
  @ApiResponse({
    status: 429,
    description: 'Trop de renvois — réessayez dans une minute',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sign-in/mfa/resend')
  resendMfaChallenge(
    @Body() dto: ResendMfaChallengeDto,
  ): Promise<MfaChallengeIssuedDto> {
    return this.resendMfaChallengeUseCase.execute({
      challengeId: dto.challengeId,
      purpose: MfaChallengePurpose.SIGN_IN,
    });
  }

  @ApiOperation({
    summary: 'Renvoyer le code du retrait en cours',
    description:
      'Réexpédie le code du défi obtenu par `POST /auth/mfa/disable/challenge`, pour les canaux `email` et `sms`.\n\n' +
      '**Le défi ne change pas** : même `challengeId`, mêmes essais restants, même échéance. Seul le code change — le précédent cesse aussitôt de fonctionner.\n\n' +
      "À préférer à un second appel de `POST /auth/mfa/disable/challenge` : celui-ci frappe un défi **neuf** et laisse le précédent vivre son échéance, ce qui rend trois essais de plus à chaque appel sur le même code à six chiffres. Cette route-ci ne touche pas au défi, donc n'en accorde aucun.\n\n" +
      "`totp` est refusé (400 `MFA_CHALLENGE_NOT_RESENDABLE`) : rien n'est expédié sur ce canal. Un défi de connexion l'est aussi, et un défi obtenu sur un autre compte également — `purpose` et `userId` sont contrôlés séparément.",
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Nouveau code envoyé — le `challengeId` est inchangé.',
    type: MfaChallengeIssuedDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Canal sans expédition (`totp`) — rien à renvoyer',
  })
  @ApiResponse({
    status: 401,
    description:
      'Authentification requise, ou défi inconnu, expiré, épuisé, ou émis pour autre chose',
  })
  @ApiResponse({
    status: 429,
    description: 'Trop de renvois — réessayez dans une minute',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/disable/resend')
  resendDisableMfaChallenge(
    @Body() dto: ResendMfaChallengeDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<MfaChallengeIssuedDto> {
    return this.resendMfaChallengeUseCase.execute({
      challengeId: dto.challengeId,
      purpose: MfaChallengePurpose.DISABLE,
      userId: user.userId,
    });
  }
}
