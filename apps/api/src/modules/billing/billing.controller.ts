import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import { AuthService, type AuthSubject } from "../auth/auth.service";
import { BillingService } from "./billing.service";
import { EntitlementsService } from "./entitlements.service";

const placeholderIntentSchema = z.object({
  plan: z.enum(["creator", "studio", "team"]),
});

@Controller("billing")
@UseGuards(WorldDockAuthGuard)
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("balance")
  @RequireScopes("billing:read")
  async balance(@CurrentSubject() subject: AuthSubject) {
    return { balance: await this.billing.getBalance(subject.user.id) };
  }

  @Get("usage")
  @RequireScopes("billing:read")
  async usage(@CurrentSubject() subject: AuthSubject) {
    return { usage: await this.billing.getUsage(subject.user.id) };
  }

  @Get("entitlements")
  @RequireScopes("billing:read")
  async entitlementsStatus() {
    return { entitlements: this.entitlements.getAlphaEntitlements() };
  }

  @Post("placeholder-intents")
  @RequireScopes("billing:read")
  async placeholderIntent(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    this.auth.assertSessionSubject(subject);
    const input = placeholderIntentSchema.parse(body);
    return { intent: await this.billing.capturePlaceholderIntent(subject.user.id, input.plan) };
  }
}
