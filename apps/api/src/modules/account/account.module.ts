import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountController } from "./account.controller";
import { ACCOUNT_REPOSITORY, AccountService, PrismaAccountRepository } from "./account.service";

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [
    AccountService,
    PrismaAccountRepository,
    {
      provide: ACCOUNT_REPOSITORY,
      useExisting: PrismaAccountRepository,
    },
  ],
  exports: [AccountService, ACCOUNT_REPOSITORY],
})
export class AccountModule {}
