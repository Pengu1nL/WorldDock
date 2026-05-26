import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export { PrismaClient };

const localDatabaseUrl = "postgresql://worlddock:worlddock@localhost:5432/worlddock";

export function createPrismaClient(connectionString = process.env.DATABASE_URL ?? localDatabaseUrl) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
