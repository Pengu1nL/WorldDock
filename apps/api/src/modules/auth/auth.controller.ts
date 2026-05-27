import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject } from "./auth.decorators";
import { WorldDockAuthGuard } from "./auth.guard";
import { AuthService, type AuthSubject } from "./auth.service";

const createAccessTokenSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(["world:read", "world:write", "repository:push"])).min(1),
  expiresAt: z.string().datetime().optional(),
});

const emailPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = emailPasswordSchema.extend({
  name: z.string().min(1).max(80).optional(),
});

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/register")
  async register(@Body() body: unknown) {
    const result = await this.authService.registerEmailPassword(registerSchema.parse(body));
    return {
      user: result.user,
      session: {
        token: result.session.token,
        expiresAt: result.session.expiresAt.toISOString(),
      },
      token: result.session.token,
    };
  }

  @Post("auth/login")
  @HttpCode(200)
  async login(@Body() body: unknown) {
    const result = await this.authService.loginEmailPassword(emailPasswordSchema.parse(body));
    return {
      user: result.user,
      session: {
        token: result.session.token,
        expiresAt: result.session.expiresAt.toISOString(),
      },
      token: result.session.token,
    };
  }

  @Get("me")
  @UseGuards(WorldDockAuthGuard)
  me(@CurrentSubject() subject: AuthSubject) {
    return {
      user: subject.user,
      auth: subject.kind === "session"
        ? { kind: "session" }
        : { kind: "access-token", accessTokenId: subject.accessTokenId, scopes: subject.scopes },
    };
  }

  @Post("auth/logout")
  @UseGuards(WorldDockAuthGuard)
  async logout(@CurrentSubject() subject: AuthSubject) {
    await this.authService.logout(subject);
    return { ok: true };
  }

  @Get("access-tokens")
  @UseGuards(WorldDockAuthGuard)
  async listAccessTokens(@CurrentSubject() subject: AuthSubject) {
    const session = this.authService.assertSessionSubject(subject);
    return {
      accessTokens: await this.authService.listAccessTokens(session.user.id),
    };
  }

  @Post("access-tokens")
  @UseGuards(WorldDockAuthGuard)
  async createAccessToken(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    const session = this.authService.assertSessionSubject(subject);
    const input = createAccessTokenSchema.parse(body);
    const issued = await this.authService.issueAccessToken(session.user.id, {
      name: input.name,
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    return {
      token: issued.plaintextToken,
      accessToken: issued.accessToken,
    };
  }

  @Delete("access-tokens/:tokenId")
  @UseGuards(WorldDockAuthGuard)
  async revokeAccessToken(@CurrentSubject() subject: AuthSubject, @Param("tokenId") tokenId: string) {
    const session = this.authService.assertSessionSubject(subject);
    const revoked = await this.authService.revokeAccessToken(session.user.id, tokenId);
    if (!revoked) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Access token not found.",
      });
    }

    return {
      accessToken: revoked,
    };
  }
}
