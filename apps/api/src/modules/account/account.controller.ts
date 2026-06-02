import { Body, Controller, Delete, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { AccountService } from "./account.service";

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  handle: z.string().regex(/^[a-z0-9-]{3,32}$/).optional(),
});

@Controller("account")
@UseGuards(WorldDockAuthGuard)
export class AccountController {
  constructor(@Inject(AccountService) private readonly account: AccountService) {}

  @Get("profile")
  profile(@CurrentSubject() subject: AuthSubject) {
    return this.account.getProfile(subject.user.id).then((profile) => ({ profile }));
  }

  @Patch("profile")
  updateProfile(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.account.updateProfile(subject.user.id, updateProfileSchema.parse(body)).then((profile) => ({ profile }));
  }

  @Patch("onboarding/complete")
  completeOnboarding(@CurrentSubject() subject: AuthSubject) {
    return this.account.completeOnboarding(subject.user.id).then((profile) => ({ profile }));
  }

  @Delete()
  deleteAccount(@CurrentSubject() subject: AuthSubject) {
    return this.account.scheduleAccountDeletion(subject.user.id).then((profile) => ({ profile }));
  }
}
