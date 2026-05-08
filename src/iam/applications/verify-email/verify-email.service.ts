import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from '../../domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from '../../domains/ports/cahe-manager.service';
import { MailerService } from '@nestjs-modules/mailer';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class VerifyEmailService {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,
    private readonly mailerService: MailerService,
  ) {}

  async sendVerificationEmail(
    emailVerificationDto: EmailVerificationDto,
  ): Promise<void> {
    const user = await this.usersRepository.findByEmail(
      emailVerificationDto.email,
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.userEmail.isVerified) {
      throw new BadRequestException('This email is already verified');
    }

    const tokenId = randomUUID();

    const token = await this.tokenService.generateEmailToken({
      sub: user.userId,
      email: user.userEmail.email,
      emailTokenId: tokenId,
    });

    await this.cacheManagerService.insertEmailTokenId(
      user.userEmail.email,
      tokenId,
    );

    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    const confirmEmailUrl = `${apiUrl}/email/verify?token=${token}`;

    await this.mailerService.sendMail({
      to: emailVerificationDto.email,
      subject: 'Confirmez votre adresse email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1A2E35; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">BeOwn</h1>
          </div>
          <div style="background-color: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Confirmez votre adresse email</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Bienvenue sur BeOwn ! Pour finaliser votre inscription et accéder à votre compte, veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmEmailUrl}" style="background: #FFB52E; color: white; padding: 15px 40px; text-decoration: none; border-radius: 25px; font-size: 16px; font-weight: bold; display: inline-block;">
                Confirmer mon email
              </a>
            </div>
            <p style="color: #999; font-size: 14px; line-height: 1.6;">
              Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
            </p>
            <p style="color: #667eea; font-size: 14px; word-break: break-all;">
              ${confirmEmailUrl}
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              Si vous n'avez pas créé de compte sur BeOwn, ignorez cet email.
            </p>
          </div>
        </div>
      `,
    });
  }

  async confirmEmail(token: string): Promise<string> {
    try {
      const emailTokenPayload = await this.tokenService.verifyEmailToken(token);

      const isValidToken = await this.cacheManagerService.validateEmailToken(
        emailTokenPayload.email,
        emailTokenPayload.emailTokenId,
      );

      if (isValidToken) {
        await this.cacheManagerService.invalidateEmailTokenId(
          emailTokenPayload.email,
        );
      } else {
        throw new BadRequestException('Token invalide ou expiré');
      }

      const user = await this.usersRepository.findByEmail(
        emailTokenPayload.email,
      );

      if (!user) {
        throw new BadRequestException('Token invalide ou expiré');
      }

      user?.userEmail.verify();

      await this.usersRepository.update(user);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return `
        <!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email vérifié - BeOwn</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(rgba(26, 46, 53, 0.85), rgba(26, 46, 53, 0.85)), 
                  url('https://images.unsplash.com/photo-1564013799919-ab600027ffc6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80');
      background-size: cover;
      background-position: center;
      background-attachment: fixed;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 40px;
      padding: 50px 40px;
      text-align: center;
      max-width: 450px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .icon {
      width: 80px;
      height: 80px;
      background: #1A2E35;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 25px;
    }
    .icon svg {
      width: 45px;
      height: 45px;
      fill: white;
    }
    h1 {
      color: #1f2937;
      font-size: 28px;
      margin-bottom: 15px;
    }
    p {
      color: #6b7280;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .btn {
      display: inline-block;
      background: #FFB52E;
      color: white;
      text-decoration: none;
      padding: 15px 40px;
      border-radius: 20px;
      font-size: 16px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    .title{
        font-size : 50px;
        color: #1A2E35;
    }
    .email {
      color: #667eea;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <h1 class="title">BeOwn</h1>
    <h1>Email vérifié avec succès !</h1>
    <p>
      Votre adresse email <span class="email">${user.userEmail.email}</span> a été vérifiée avec succès.
      Vous pouvez maintenant vous connecter à votre compte BeOwn.
    </p>
    <a href="${frontendUrl}/auth/login" class="btn">Se connecter</a>
  </div>
</body>
</html>
      `;
    } catch {
      throw new BadRequestException('Token invalide ou expiré');
    }
  }
}
