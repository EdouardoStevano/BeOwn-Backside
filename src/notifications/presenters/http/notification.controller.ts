import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationService } from '../../applications/notification.service';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiOperation({ summary: 'Mes notifications (50 dernières)' })
  @ApiResponse({ status: 200, description: 'Liste des notifications' })
  @Get('me')
  getMyNotifications(@CurrentUser() user: ActiveUser) {
    return this.notificationService.findByUserId(user.userId);
  }

  @ApiOperation({ summary: 'Nombre de notifications non lues' })
  @ApiResponse({ status: 200 })
  @Get('me/unread-count')
  async getUnreadCount(@CurrentUser() user: ActiveUser) {
    const count = await this.notificationService.countUnread(user.userId);
    return { count };
  }

  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiParam({ name: 'id', description: 'UUID de la notification' })
  @ApiResponse({ status: 200, description: '{ updated: boolean }' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    // L'identité vient du jeton, jamais de l'URL : la notification d'un autre
    // utilisateur n'est pas atteignable, même en devinant son identifiant.
    return this.notificationService.markAsRead(id, user.userId);
  }

  @ApiOperation({ summary: 'Tout marquer comme lu' })
  @ApiResponse({ status: 200 })
  @HttpCode(HttpStatus.OK)
  @Post('me/read-all')
  markAllAsRead(@CurrentUser() user: ActiveUser) {
    return this.notificationService.markAllAsRead(user.userId);
  }

  @ApiOperation({ summary: 'Supprimer une notification' })
  @ApiParam({ name: 'id', description: 'UUID de la notification' })
  @ApiResponse({ status: 200, description: '{ deleted: boolean }' })
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  deleteOne(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.notificationService.deleteOne(id, user.userId);
  }

  @ApiOperation({ summary: 'Vider toutes mes notifications' })
  @ApiResponse({ status: 200, description: '{ deletedCount: number }' })
  @HttpCode(HttpStatus.OK)
  @Delete('me/all')
  deleteAll(@CurrentUser() user: ActiveUser) {
    return this.notificationService.deleteAll(user.userId);
  }
}
