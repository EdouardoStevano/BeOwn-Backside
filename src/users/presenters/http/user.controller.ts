import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from 'src/users/applications/users.service';
import { RegisterDto } from '../dto/user.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Créer un nouveau compte utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @Post()
  register(@Body() dto: RegisterDto) {
    return this.usersService.create(dto);
  }
}
