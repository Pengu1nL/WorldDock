import { createPrismaClient } from "../src";

const prisma = createPrismaClient();

export async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seed data is disabled. Set ALLOW_DEMO_SEED=true only for disposable demo databases.");
  }

  const owner = await prisma.user.upsert({
    where: { email: "demo@worlddock.local" },
    update: {},
    create: {
      email: "demo@worlddock.local",
      name: "WorldDock Demo",
      emailVerified: true,
      role: "user",
    },
  });

  await prisma.world.upsert({
    where: { id: "world_memory_demo" },
    update: {},
    create: {
      id: "world_memory_demo",
      ownerId: owner.id,
      name: "回忆所",
      type: "近未来 / 软科幻 / 社会派",
      summary: "在一个允许记忆作为资产交易的近未来社会，个人最私密的体验成为了可估值、可转让、可继承的财产。",
      tags: ["记忆", "制度细节", "道德灰度"],
      maturity: 64,
    },
  });

  await prisma.world.upsert({
    where: { id: "world_city_demo" },
    update: {},
    create: {
      id: "world_city_demo",
      ownerId: owner.id,
      name: "市声",
      type: "都市奇幻 / 思辨",
      summary: "城市拥有集体意识，居民同时是它的细胞、它的语言、它的食物。",
      tags: ["城市", "集体意识"],
      maturity: 41,
    },
  });

  console.log("WorldDock seed: demo user and worlds are ready.");
}

await main().finally(async () => {
  await prisma.$disconnect();
});
