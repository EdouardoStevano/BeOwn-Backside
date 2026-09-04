import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Corps de `PATCH /cgp/clients/:clientId/link`.
 *
 * Le CGP destinataire est DÉSIGNÉ explicitement au lieu d'être déduit de
 * l'appelant : c'est ce qui rend le rattachement administrable (un
 * `super_admin` rattache un client à un tiers) tout en fermant l'auto-service
 * par lequel un CGP s'attribuait n'importe quel investisseur.
 */
export class LinkClientToCgpDto {
  @ApiProperty({ description: 'userId du CGP auquel rattacher le client' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  cgpId: number;
}
