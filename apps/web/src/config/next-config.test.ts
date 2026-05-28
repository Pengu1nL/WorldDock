import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next production config", () => {
  it("does not force static export in production builds", () => {
    expect(nextConfig).not.toHaveProperty("output", "export");
  });

  it("does not rewrite asset paths for file-system static export", () => {
    expect(nextConfig).not.toHaveProperty("assetPrefix", ".");
  });
});
