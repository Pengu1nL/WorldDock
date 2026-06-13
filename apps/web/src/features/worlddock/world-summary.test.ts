import { describe, expect, it } from "vitest";
import { formatWorldUpdatedDate, getWorldCardSummary, getWorldStoredSummary } from "./world-summary";

describe("world summary helpers", () => {
  it("formats ISO timestamps as compact card dates", () => {
    expect(formatWorldUpdatedDate("2026-06-08T03:34:31.789Z")).toBe("26-06-08");
    expect(formatWorldUpdatedDate("刚刚")).toBe("刚刚");
  });

  it("compacts older multiline summaries for world cards", () => {
    const summary = [
      "在22世纪，机械化身体改造已从医疗选项演变为社会通行实践。人们可以通过更换义体器官、神经接口甚至全身义体化来获得超常能力。",
      "核心矛盾：义体依赖与人性丧失的代价。",
      "初始灵感：未来，人类直接接受机械化改造身体。",
    ].join("\n");

    expect(getWorldCardSummary(summary)).toBe("在22世纪，机械化身体改造已从医疗选项演变为社会通行实践。");
  });

  it("uses the generated short summary when storing a new world", () => {
    expect(getWorldStoredSummary({
      shortSummary: "雾港每天清晨都会吐出居民遗忘的秘密。",
      coreSetting: "雾港有复杂的记忆盐税和秘密潮汐制度。",
      inspiration: "一座港口每天吐出秘密。",
    })).toBe("雾港每天清晨都会吐出居民遗忘的秘密。");
  });
});
