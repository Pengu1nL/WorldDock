import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { AuthSubject } from "./auth.service";

export const REQUIRED_SCOPES_METADATA = "worlddock:required-scopes";

export function RequireScopes(...scopes: string[]) {
  return SetMetadata(REQUIRED_SCOPES_METADATA, scopes);
}

export const CurrentSubject = createParamDecorator((_: unknown, context: ExecutionContext): AuthSubject => {
  return context.switchToHttp().getRequest<{ authSubject: AuthSubject }>().authSubject;
});
