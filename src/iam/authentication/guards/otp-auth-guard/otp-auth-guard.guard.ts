import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { OtpAuthenticationService } from '../../otp-authentication.service';

@Injectable()
export class OtpAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly otpAuthService: OtpAuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const { email, tfaCode } = request.body;

    const user = await this.usersRepository.findOneBy({ email });

    if (user!.isTfaEnabled) {
      if (!tfaCode) {
        throw new UnauthorizedException('Invalid 2FA code');
      }

      const isValid = await this.otpAuthService.verifyCode(
        tfaCode.toString(),
        user!.tfaSecret,
      );

      if (!isValid.valid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    } else {
      return true;
    }

    return true;
  }
}
