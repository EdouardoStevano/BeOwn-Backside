import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { HashingService } from 'src/iam/hashing/hashing.service';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ValidatePasswordGuard implements CanActivate {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly hashingService: HashingService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { email, password } = context
      .switchToHttp()
      .getRequest<Request>().body;

    const user = await this.usersRepository.findOneBy({
      email: email,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid user credential');
    }

    const isEqual = await this.hashingService.compare(password, user.password);

    if (!isEqual) {
      throw new UnauthorizedException('Invalid user credential');
    }

    return true;
  }
}
