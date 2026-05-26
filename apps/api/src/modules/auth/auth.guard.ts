import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService, type AuthSubject } from "./auth.service";
import { REQUIRED_SCOPES_METADATA } from "./auth.decorators";

@Injectable()
export class WorldDockAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      authSubject?: AuthSubject;
    }>();
    const token = this.readBearerToken(request.headers);
    const subject = await this.authService.authenticateBearer(token);
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];

    this.authService.assertScopes(subject, requiredScopes);
    request.authSubject = subject;
    return true;
  }

  private readBearerToken(headers: Record<string, string | string[] | undefined>): string {
    const authorization = headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value?.startsWith("Bearer ")) {
      throw this.authService.authRequired();
    }

    return value.slice("Bearer ".length).trim();
  }
}
