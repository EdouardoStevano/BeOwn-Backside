import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { NotificationUnsubscribeService } from 'src/notifications/applications/notification-unsubscribe.service';

export class UnsubscribeDto {
  @ApiProperty({ description: 'Token de désinscription (lien reçu par email/SMS)' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

/**
 * Endpoint public de désinscription marketing : appelé par la page
 * `/desinscription?token=...` du Frontside, sans session (le destinataire
 * peut être déconnecté, sur un autre appareil, voire ne plus vouloir se
 * connecter du tout — exiger un login casserait l'opt-out).
 */
@ApiTags('Public — Notifications')
@Controller('public/notifications')
export class PublicUnsubscribeController {
  constructor(private readonly unsubscribeService: NotificationUnsubscribeService) {}

  @ApiOperation({ summary: 'Se désinscrire des communications marketing (public)' })
  @ApiResponse({ status: 200, description: 'Désinscription enregistrée (idempotent)' })
  @ApiResponse({ status: 401, description: 'Token invalide, expiré ou de mauvais type' })
  @Throttle({ short: { ttl: 60_000, limit: 20 }, medium: { ttl: 60_000, limit: 20 }, auth: { ttl: 60_000, limit: 20 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('unsubscribe')
  unsubscribe(@Body() dto: UnsubscribeDto): Promise<{ success: true }> {
    return this.unsubscribeService.unsubscribe(dto.token);
  }
}
