"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TweakRadio,
  TweakSection,
  TweaksPanel,
  useTweaks,
} from "../tweaks-panel";
import { WorldDockRuntime } from "../world-dock-app";

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mode": "local",
  "density": "regular",
  "titleFont": "serif",
  "appTheme": "light"
}/*EDITMODE-END*/;

const worldDockQueryClient = new QueryClient();

export function WorldDockShell() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => { document.documentElement.dataset.direction = "obs"; }, []);
  useEffect(() => { document.documentElement.dataset.density = t.density; }, [t.density]);
  useEffect(() => { document.documentElement.dataset.titleFont = t.titleFont; }, [t.titleFont]);
  useEffect(() => { document.documentElement.dataset.appTheme = t.appTheme; }, [t.appTheme]);

  return (
    <QueryClientProvider client={worldDockQueryClient}>
      <WorldDockRuntime tweaks={t}>
        <TweaksPanel title="Tweaks">
          <TweakSection label="排版 · TYPOGRAPHY"/>
          <TweakRadio label="对话密度" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v: any) => setTweak("density", v)}/>
          <TweakRadio label="标题字体" value={t.titleFont} options={["sans", "serif"]} onChange={(v: any) => setTweak("titleFont", v)}/>
          <TweakSection label="主题 · THEME"/>
          <TweakRadio label="深浅" value={t.appTheme} options={["light", "dark"]} onChange={(v: any) => setTweak("appTheme", v)}/>
        </TweaksPanel>
      </WorldDockRuntime>
    </QueryClientProvider>
  );
}
