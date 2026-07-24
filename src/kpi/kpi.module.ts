import { Module } from '@nestjs/common';

/**
 * Lot 1: module skeleton only. Services and controllers are added in Lot 2 and Lot 3.
 * KpiCalculator is a pure module imported directly by services (no DI needed).
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class KpiModule {}
