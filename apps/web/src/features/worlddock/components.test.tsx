// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./components";

describe("StatusBar", () => {
  it("keeps the current world name visible without placeholder status clutter", () => {
    render(
      <StatusBar
        world={{ name: "潮汐之书", maturity: 72, status: "draft" }}
      />,
    );

    expect(screen.getByText("潮汐之书")).toBeVisible();
    expect(screen.queryByText("@ren")).not.toBeInTheDocument();
    expect(screen.queryByText("maturity")).not.toBeInTheDocument();
    expect(screen.queryByText("72%")).not.toBeInTheDocument();
    expect(screen.queryByText("草稿")).not.toBeInTheDocument();
    expect(screen.queryByText("LOCAL")).not.toBeInTheDocument();
    expect(screen.queryByText("model")).not.toBeInTheDocument();
    expect(screen.queryByText("run")).not.toBeInTheDocument();
    expect(screen.queryByText(/tk$/)).not.toBeInTheDocument();
  });
});
