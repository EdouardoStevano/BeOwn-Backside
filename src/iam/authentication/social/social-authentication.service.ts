import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenService } from 'src/iam/token/token.service';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { SocialInterface } from './interface/social.interface';

@Injectable()
export class SocialAuthService {
  constructor(
    private readonly tokenService: TokenService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async authenticate(social: SocialInterface) {
    try {
      const user = await this.userRepository.findOneBy({
        socialId: social.socialId,
      });

      if (user) {
        const [accessToken, refreshToken] =
          await this.tokenService.generateToken(user);

        return { accessToken, refreshToken };
      } else {
        const newUser = await this.userRepository.save({ ...social });

        const [accessToken, refreshToken] =
          await this.tokenService.generateToken(newUser);

        return { accessToken, refreshToken };
      }
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException('Email already in use');
      }
    }
  }
}
