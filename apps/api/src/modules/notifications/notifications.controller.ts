import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { NotificationsService } from "./notifications.service";

const feedbackSchema = z.object({
  message: z.string().trim().min(6).max(2000),
  context: z.record(z.string(), z.unknown()).default({}),
});

@Controller()
@UseGuards(WorldDockAuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get("notifications")
  @RequireScopes("world:read")
  list(@CurrentSubject() subject: AuthSubject) {
    return this.notifications.list(subject);
  }

  @Get("activity")
  @RequireScopes("world:read")
  listActivity(@CurrentSubject() subject: AuthSubject) {
    return this.notifications.listActivity(subject);
  }

  @Post("notifications/:notificationId/read")
  @RequireScopes("world:write")
  async markRead(@CurrentSubject() subject: AuthSubject, @Param("notificationId") notificationId: string) {
    return { notification: await this.notifications.markRead(subject, notificationId) };
  }

  @Post("support/feedback")
  @RequireScopes("world:write")
  submitFeedback(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.notifications.submitFeedback(subject, feedbackSchema.parse(body));
  }
}
