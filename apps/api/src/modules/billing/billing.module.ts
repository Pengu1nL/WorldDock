import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingController } from "./billing.controller";
import { BILLING_REPOSITORY } from "./billing.repository";
import { BillingService } from "./billing.service";
import { EntitlementsService } from "./entitlements.service";
import { PrismaBillingRepository } from "./prisma-billing.repository";

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    EntitlementsService,
    PrismaBillingRepository,
    {
      provide: BILLING_REPOSITORY,
      useExisting: PrismaBillingRepository,
    },
  ],
  exports: [BillingService, EntitlementsService, BILLING_REPOSITORY],
})
export class BillingModule {}
