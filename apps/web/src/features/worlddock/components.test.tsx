// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./components";

describe("StatusBar", () => {
  it("keeps creator-facing world status visible and marks technical status as low priority", () => {
    render(
      <StatusBar
        mode="local"
        tokens={120}
        world={{ name: "潮汐之书", maturity: 72, status: "draft" }}
      />,
    );

    expect(screen.getByText("潮汐之书")).toBeVisible();
    expect(screen.getByText("72%")).toBeVisible();
    const modeValue = screen.getByText("LOCAL");
    const modeSection = modeValue.closest(".statusbar-section");
    const modeDot = modeSection?.querySelector(".dot");

    expect(modeSection).toHaveClass("statusbar-technical");
    expect(modeValue).not.toHaveAttribute("style", expect.stringContaining("var(--sage)"));
    expect(modeDot).toHaveClass("statusbar-technical-dot");
    expect(modeDot).not.toHaveClass("sage");
    expect(screen.getByText("run")).toHaveClass("statusbar-technical");
    expect(screen.getByText("model")).toHaveClass("statusbar-technical");
    expect(screen.getByText("120 tk")).not.toHaveAttribute("style", expect.stringContaining("var(--amber)"));
  });
});
