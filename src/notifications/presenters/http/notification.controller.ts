import { Body, Controller, Get, Param, ParseIntPipe, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationService } from '../../applications/notification.service';
import { NotificationCanal } from '../../infrastructure/persistences/entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty()
  @IsNumber()
  userId: number;

  @ApiProperty({ enum: NotificationCanal })
  @IsEnum(NotificationCanal)
  canal: NotificationCanal;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  templateCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiOperation({ summary: 'Lister mes notifications' })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des notifications' })
  @Get('user/:userId')
  listByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.notificationService.findByUserId(userId);
  }

  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiParam({ name: 'id', description: 'UUID de la notification' })
  @ApiResponse({ status: 200, description: 'Notification marquée comme lue' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  @ApiOperation({ summary: 'Créer une notification (admin)' })
  @ApiResponse({ status: 201, description: 'Notification créée' })
  @Post()
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationService.create(
      dto.userId,
      dto.canal,
      dto.templateCode,
      dto.metadata,
    );
  }
}
