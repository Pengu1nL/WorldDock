import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  transpilePackages: ["@worlddock/domain"],
  ...(isDev
    ? {}
    : {
        output: "export",
        assetPrefix: ".",
      }),
};

export default nextConfig;
