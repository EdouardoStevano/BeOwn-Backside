import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YouSignService } from './yousign.service';

@Module({
  imports: [ConfigModule],
  providers: [YouSignService],
  exports: [YouSignService],
})
export class YouSignModule {}
