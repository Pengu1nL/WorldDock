import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { BillingService } from "./billing.service";

@Controller("billing")
@UseGuards(WorldDockAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("balance")
  @RequireScopes("world:read")
  async balance(@CurrentSubject() subject: AuthSubject) {
    return { balance: await this.billing.getBalance(subject.user.id) };
  }

  @Get("usage")
  @RequireScopes("world:read")
  async usage(@CurrentSubject() subject: AuthSubject) {
    return { usage: await this.billing.getUsage(subject.user.id) };
  }
}
