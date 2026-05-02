import { Controller, Get, Param, ParseIntPipe, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from '../../applications/notification.service';
import { NotificationEntity, NotificationCanal } from '../../infrastructures/persistences/entities/notification.entity';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiOperation({ summary: 'Lister mes notifications' })
  @ApiResponse({ status: 200, description: 'Liste des notifications' })
  @Get('user/:userId')
  listByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.notificationService.findByUserId(userId);
  }

  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiResponse({ status: 200, description: 'Notification marquée comme lue' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  @ApiOperation({ summary: 'Créer une notification (admin)' })
  @ApiResponse({ status: 201, description: 'Notification créée' })
  @Post()
  create(
    @Param('userId', ParseIntPipe) userId: number,
    canal: NotificationCanal,
    templateCode: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.notificationService.create(userId, canal, templateCode, metadata);
  }
}
