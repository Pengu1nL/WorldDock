import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingController } from "./billing.controller";
import { BILLING_REPOSITORY } from "./billing.repository";
import { BillingService } from "./billing.service";
import { PrismaBillingRepository } from "./prisma-billing.repository";

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    PrismaBillingRepository,
    {
      provide: BILLING_REPOSITORY,
      useExisting: PrismaBillingRepository,
    },
  ],
  exports: [BillingService, BILLING_REPOSITORY],
})
export class BillingModule {}
