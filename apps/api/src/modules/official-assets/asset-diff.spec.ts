import { describe, expect, it } from "vitest";
import { createLineDiff } from "./asset-diff";

describe("createLineDiff", () => {
  it("returns stable line operations", () => {
    expect(createLineDiff("A\nB\nC", "A\nB2\nC\nD")).toEqual([
      { type: "context", text: "A", lineFrom: 1, lineTo: 1 },
      { type: "remove", text: "B", lineFrom: 2 },
      { type: "add", text: "B2", lineTo: 2 },
      { type: "context", text: "C", lineFrom: 3, lineTo: 3 },
      { type: "add", text: "D", lineTo: 4 },
    ]);
  });
});
