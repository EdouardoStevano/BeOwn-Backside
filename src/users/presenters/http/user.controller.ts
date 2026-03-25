import { Body, Controller, Post } from '@nestjs/common';
import { UsersService } from 'src/users/applications/users.service';
import { RegisterDto } from '../dto/user.dto';

@Controller('users')
export class UserController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  register(@Body() dto: RegisterDto) {
    return this.usersService.create(dto);
  }
}
