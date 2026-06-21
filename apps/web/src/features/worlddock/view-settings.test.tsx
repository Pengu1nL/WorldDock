// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./view-settings";

describe("SettingsView Hub connection", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads only the token prefix and never renders the saved full PAT", async () => {
    const fullToken = "wdpat_1234567890_full_secret";
    const hubApi = {
      getHubConnection: vi.fn(async () => ({
        connection: {
          hubUrl: "https://hub.worlddock.test",
          tokenPrefix: "wdpat_12",
        },
      })),
      saveHubConnection: vi.fn(),
      deleteHubConnection: vi.fn(),
      testHubConnection: vi.fn(),
    };

    const { container } = render(
      <SettingsView
        currentWorld={null}
        onBack={() => undefined}
        onToast={() => undefined}
        hubApi={hubApi}
      />,
    );

    expect(container.querySelector(".crumb")).not.toBeInTheDocument();
    expect(screen.queryByText("/ settings")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "界仓" }));

    expect(await screen.findByText("PAT wdpat_12...")).toBeInTheDocument();
    expect(screen.getByLabelText("Hub URL")).toHaveValue("https://hub.worlddock.test");
    expect(screen.getByLabelText("PAT")).toHaveValue("");
    expect(document.body).not.toHaveTextContent(fullToken);
    expect((screen.getByLabelText("PAT") as HTMLInputElement).value).not.toBe(fullToken);
  });

  it("saves, tests, and disconnects a Hub connection", async () => {
    const onToast = vi.fn();
    const hubApi = {
      getHubConnection: vi.fn(async () => ({ connection: null })),
      saveHubConnection: vi.fn(async () => ({
        connection: {
          hubUrl: "https://hub.worlddock.test",
          tokenPrefix: "wdpat_99",
        },
      })),
      deleteHubConnection: vi.fn(async () => ({ connection: null })),
      testHubConnection: vi.fn(async () => ({ ok: true as const })),
    };

    render(
      <SettingsView
        currentWorld={null}
        onBack={() => undefined}
        onToast={onToast}
        hubApi={hubApi}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "界仓" }));
    await screen.findByText("未连接");

    fireEvent.change(screen.getByLabelText("Hub URL"), {
      target: { value: "https://hub.worlddock.test/" },
    });
    fireEvent.change(screen.getByLabelText("PAT"), {
      target: { value: "wdpat_999999999999999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(hubApi.saveHubConnection).toHaveBeenCalledWith({
      hubUrl: "https://hub.worlddock.test/",
      token: "wdpat_999999999999999999",
    }));
    expect(screen.getByLabelText("PAT")).toHaveValue("");
    expect(onToast).toHaveBeenCalledWith({ kind: "save", text: "界仓连接已保存" });

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(hubApi.testHubConnection).toHaveBeenCalledTimes(1));
    expect(onToast).toHaveBeenCalledWith({ kind: "save", text: "界仓连接可用" });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(hubApi.deleteHubConnection).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Hub URL")).toHaveValue("");
    expect(screen.getByLabelText("PAT")).toHaveValue("");
    expect(onToast).toHaveBeenCalledWith({ kind: "warn", text: "界仓连接已断开" });
  });
});
