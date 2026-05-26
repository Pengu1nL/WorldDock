import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { WorldDockAuthGuard } from "./auth.guard";
import { AUTH_REPOSITORY, AuthService } from "./auth.service";
import { PrismaAuthRepository } from "./prisma-auth.repository";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    WorldDockAuthGuard,
    PrismaAuthRepository,
    {
      provide: AUTH_REPOSITORY,
      useExisting: PrismaAuthRepository,
    },
  ],
  exports: [AuthService, AUTH_REPOSITORY],
})
export class AuthModule {}
