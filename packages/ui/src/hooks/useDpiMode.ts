import * as React from "react";

export function resolveDpiMode(metrics: {
  innerWidth: number;
  devicePixelRatio?: number;
  visualViewportWidth?: number;
}): "compact" | "full" {
  const baseWidth = Math.max(0, metrics.visualViewportWidth ?? metrics.innerWidth);
  const devicePixelRatio = Math.max(1, metrics.devicePixelRatio ?? 1);
  const densityPenalty = devicePixelRatio > 1.25 ? Math.min(1.85, devicePixelRatio / 1.25) : 1;
  const effectiveWidth = baseWidth / densityPenalty;
  return effectiveWidth <= 860 ? "compact" : "full";
}

export function useDpiMode(): "compact" | "full" {
  const [mode, setMode] = React.useState<"compact" | "full">(() => {
    if (typeof window === "undefined") {
      return "full";
    }
    return resolveDpiMode({
      innerWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio,
      visualViewportWidth: window.visualViewport?.width,
    });
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const update = () => {
      setMode(
        resolveDpiMode({
          innerWidth: window.innerWidth,
          devicePixelRatio: window.devicePixelRatio,
          visualViewportWidth: window.visualViewport?.width,
        })
      );
    };

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return mode;
}
