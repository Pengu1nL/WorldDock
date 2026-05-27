import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createPrismaClient } from "@worlddock/db";

const prisma = createPrismaClient();

export const worldDockAuth = betterAuth({
  appName: "WorldDock",
  secret: process.env.BETTER_AUTH_SECRET ?? "development_secret_at_least_32_chars",
  baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.API_PORT ?? "4000"}`,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
  },
});
