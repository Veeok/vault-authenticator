import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PATTERN_NODE_SIZE, PATTERN_PAD_SIZE, PatternLock, patternDotCenter } from "./PatternLock";
import "../ui.css";

function mountPattern(): { host: HTMLElement; root: Root; unmount: () => void } {
  const host = document.createElement("div");
  host.className = "auth-root theme-dark accent-none";
  host.style.width = "460px";
  host.style.height = "820px";
  document.body.appendChild(host);

  const root = createRoot(host);
  act(() => {
    root.render(<PatternLock mode="verify" onComplete={() => {}} />);
  });

  return {
    host,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("PatternLock layout tokens", () => {
  it("keeps evenly spaced center coordinates for a 3x3 grid", () => {
    const row0 = [patternDotCenter(0), patternDotCenter(1), patternDotCenter(2)];
    const row1 = [patternDotCenter(3), patternDotCenter(4), patternDotCenter(5)];
    const row2 = [patternDotCenter(6), patternDotCenter(7), patternDotCenter(8)];

    const col0 = [patternDotCenter(0), patternDotCenter(3), patternDotCenter(6)];
    const col1 = [patternDotCenter(1), patternDotCenter(4), patternDotCenter(7)];
    const col2 = [patternDotCenter(2), patternDotCenter(5), patternDotCenter(8)];

    const horizontalStep = row0[1].x - row0[0].x;
    const verticalStep = col0[1].y - col0[0].y;

    expect(horizontalStep).toBeCloseTo(row0[2].x - row0[1].x, 4);
    expect(verticalStep).toBeCloseTo(col0[2].y - col0[1].y, 4);

    expect(row0[0].y).toBeCloseTo(row0[1].y, 4);
    expect(row0[1].y).toBeCloseTo(row0[2].y, 4);
    expect(row1[0].y).toBeCloseTo(row1[1].y, 4);
    expect(row1[1].y).toBeCloseTo(row1[2].y, 4);
    expect(row2[0].y).toBeCloseTo(row2[1].y, 4);
    expect(row2[1].y).toBeCloseTo(row2[2].y, 4);

    expect(col0[0].x).toBeCloseTo(col0[1].x, 4);
    expect(col0[1].x).toBeCloseTo(col0[2].x, 4);
    expect(col1[0].x).toBeCloseTo(col1[1].x, 4);
    expect(col1[1].x).toBeCloseTo(col1[2].x, 4);
    expect(col2[0].x).toBeCloseTo(col2[1].x, 4);
    expect(col2[1].x).toBeCloseTo(col2[2].x, 4);
  });

  it("renders a centered 3x3 grid with responsive size tokens", async () => {
    const ui = mountPattern();
    await flush();

    const pad = ui.host.querySelector(".pattern-lock-pad") as HTMLElement;
    expect(pad).toBeTruthy();
    expect(pad.style.getPropertyValue("--pattern-pad-size").trim()).toBe(PATTERN_PAD_SIZE);
    expect(pad.style.getPropertyValue("--pattern-node-size").trim()).toBe(PATTERN_NODE_SIZE);

    expect(ui.host.querySelector(".pattern-lock-grid")).toBeTruthy();
    expect(ui.host.querySelectorAll(".pattern-lock-cell").length).toBe(9);
    expect(ui.host.querySelectorAll(".pattern-lock-node").length).toBe(9);

    ui.host.style.width = "1400px";
    ui.host.style.height = "900px";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await flush();
    expect(ui.host.querySelectorAll(".pattern-lock-node").length).toBe(9);

    ui.unmount();
  });
});
