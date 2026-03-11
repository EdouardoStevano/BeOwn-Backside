import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { HashingService } from '../hashing/hashing.service';
import { TokenService } from '../token/token.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { OtpAuthenticationService } from './otp-authentication.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@Injectable()
export class AuthenticationService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    private readonly otpAuthService: OtpAuthenticationService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    try {
      const user = new User();
      user.email = signUpDto.email;
      user.password = await this.hashingService.hash(signUpDto.password);

      await this.usersRepository.save(user);
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException('Email already existed!');
      }
      throw err;
    }
  }

  async signIn(signInDto: SignInDto) {
    const user = await this.usersRepository.findOneBy({
      email: signInDto.email,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid user credential');
    }

    const isEqual = await this.hashingService.compare(
      signInDto.password,
      user.password,
    );

    if (!isEqual) {
      throw new UnauthorizedException('Invalid user credential');
    }

    if (user.isTfaEnabled) {
      const isValid = await this.otpAuthService.verifyCode(
        signInDto.tfaCode?.toString() ?? '0',
        user.tfaSecret,
      );

      if (!isValid.valid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    const [accessToken, refreshToken] =
      await this.tokenService.generateToken(user);

    return { accessToken, refreshToken };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const [accessToken, refreshToken] =
        await this.tokenService.refreshTokens(refreshTokenDto);

      return { accessToken, refreshToken };
    } catch (err) {
      throw new UnauthorizedException();
    }
  }
}
