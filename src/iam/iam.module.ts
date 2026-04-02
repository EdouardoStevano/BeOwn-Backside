import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';
import { AuthenticationModule } from './authentication/application/authentication.module';

@Module({ imports: [IamInfrastructureModule, AuthenticationModule] })
export class IamModule {}
