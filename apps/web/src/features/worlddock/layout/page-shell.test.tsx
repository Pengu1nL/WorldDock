// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageBody, PageHeader, PageShell, PageToolbar } from "./page-shell";

describe("PageShell", () => {
  it("renders a consistent page header with title, breadcrumb, subtitle, and action", () => {
    render(
      <PageShell>
        <PageHeader
          breadcrumb="/ ren / worlds"
          title="我的世界"
          subtitle="2 个世界"
          actions={<button type="button">新建世界</button>}
        />
      </PageShell>,
    );

    expect(screen.getByText("/ ren / worlds")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "我的世界" })).toBeInTheDocument();
    expect(screen.getByText("2 个世界")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建世界" })).toBeInTheDocument();
  });

  it("applies content width classes for work and reading layouts", () => {
    render(
      <PageShell>
        <PageBody width="work">工作内容</PageBody>
        <PageBody width="read">阅读内容</PageBody>
        <PageBody width="fluid">全宽内容</PageBody>
      </PageShell>,
    );

    expect(screen.getByText("工作内容")).toHaveClass("page-body", "page-body-work");
    expect(screen.getByText("阅读内容")).toHaveClass("page-body", "page-body-read");
    expect(screen.getByText("全宽内容")).toHaveClass("page-body", "page-body-fluid");
  });

  it("does not add a nested main landmark when rendered inside the app main", () => {
    const { container } = render(
      <main>
        <PageBody width="work">工作内容</PageBody>
      </main>,
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector(".page-body")).toHaveClass("page-body", "page-body-work");
  });

  it("renders toolbar content with the shared toolbar class", () => {
    render(
      <PageToolbar>
        <button type="button">全部</button>
      </PageToolbar>,
    );

    expect(screen.getByRole("toolbar")).toHaveClass("page-toolbar");
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
  });
});
