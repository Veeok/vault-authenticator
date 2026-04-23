import * as React from "react";

export interface PatternLockProps {
  mode: "set" | "verify";
  onComplete: (path: number[]) => void;
  error?: boolean;
  success?: boolean;
  disabled?: boolean;
}

type Point = { x: number; y: number };

const GRID_SIZE = 3;
const VIEWBOX_SIZE = 100;
const CELL_SIZE = VIEWBOX_SIZE / GRID_SIZE;
const HIT_RADIUS = 14;

export const PATTERN_PAD_SIZE = "clamp(240px, 32vh, 340px)";
export const PATTERN_NODE_SIZE = "clamp(44px, 6vh, 58px)";

export function patternDotCenter(index: number): Point {
  const row = Math.floor(index / GRID_SIZE);
  const column = index % GRID_SIZE;
  return {
    x: (column + 0.5) * CELL_SIZE,
    y: (row + 0.5) * CELL_SIZE,
  };
}

const DEFAULT_DOTS: Point[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => patternDotCenter(index));

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function nearestDot(point: Point, path: number[], dots: Point[]): number | null {
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < dots.length; index += 1) {
    if (path.includes(index)) continue;
    const dist = distance(dots[index], point);
    if (dist > HIT_RADIUS) continue;
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function getPointerPoint(event: React.PointerEvent<HTMLElement>, node: HTMLElement): Point {
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return { x: 0, y: 0 };
  }

  const x = ((event.clientX - rect.left) / rect.width) * VIEWBOX_SIZE;
  const y = ((event.clientY - rect.top) / rect.height) * VIEWBOX_SIZE;
  return { x, y };
}

export function PatternLock({ mode, onComplete, error = false, success = false, disabled = false }: PatternLockProps) {
  const [path, setPath] = React.useState<number[]>([]);
  const [drawing, setDrawing] = React.useState(false);
  const [cursor, setCursor] = React.useState<Point | null>(null);
  const [dots, setDots] = React.useState<Point[]>(DEFAULT_DOTS);
  const pathRef = React.useRef<number[]>([]);
  const padRef = React.useRef<HTMLDivElement | null>(null);
  const nodeRefs = React.useRef<Array<HTMLSpanElement | null>>([]);

  const readDots = React.useCallback((): Point[] => {
    const pad = padRef.current;
    if (!pad) return DEFAULT_DOTS;

    const padRect = pad.getBoundingClientRect();
    if (padRect.width === 0 || padRect.height === 0) {
      return DEFAULT_DOTS;
    }

    const measured = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
      const node = nodeRefs.current[index];
      if (!node) return DEFAULT_DOTS[index];

      const rect = node.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      return {
        x: ((centerX - padRect.left) / padRect.width) * VIEWBOX_SIZE,
        y: ((centerY - padRect.top) / padRect.height) * VIEWBOX_SIZE,
      };
    });

    return measured;
  }, []);

  React.useEffect(() => {
    const refresh = () => {
      setDots(readDots());
    };

    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener("resize", refresh);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
    };
  }, [readDots]);

  const finalize = React.useCallback(
    (completedPath: number[]) => {
      if (completedPath.length >= 4) {
        onComplete(completedPath);
      }
      window.setTimeout(() => {
        pathRef.current = [];
        setPath([]);
        setCursor(null);
      }, 120);
    },
    [onComplete]
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const pad = padRef.current;
      if (!pad) return;

      const measuredDots = readDots();
      setDots(measuredDots);
      const point = getPointerPoint(event, pad);
      const index = nearestDot(point, [], measuredDots);
      if (index == null) return;

      event.preventDefault();
      pad.setPointerCapture(event.pointerId);

      const nextPath = [index];
      pathRef.current = nextPath;
      setPath(nextPath);
      setCursor(point);
      setDrawing(true);
    },
    [disabled, readDots]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drawing || disabled) return;
      const pad = padRef.current;
      if (!pad) return;

      const point = getPointerPoint(event, pad);
      setCursor(point);

      const previous = pathRef.current;
      const index = nearestDot(point, previous, dots);
      if (index == null) {
        return;
      }

      const next = [...previous, index];
      pathRef.current = next;
      setPath(next);
    },
    [disabled, dots, drawing]
  );

  const handlePointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drawing) return;
      const pad = padRef.current;
      if (pad && pad.hasPointerCapture(event.pointerId)) {
        pad.releasePointerCapture(event.pointerId);
      }
      setDrawing(false);
      finalize(pathRef.current);
    },
    [drawing, finalize]
  );

  const activeDots = React.useMemo(() => new Set(path), [path]);

  return (
    <div
      className={`pattern-lock pattern-lock-${mode}${error ? " is-error" : ""}${success ? " is-success" : ""}${
        disabled ? " is-disabled" : ""
      }`}
    >
      <div
        ref={padRef}
        className="pattern-lock-pad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={
          {
            "--pattern-pad-size": PATTERN_PAD_SIZE,
            "--pattern-node-size": PATTERN_NODE_SIZE,
          } as React.CSSProperties
        }
      >
        <svg className="pattern-lock-lines" viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} preserveAspectRatio="none" aria-hidden="true">
          {path.map((dotIndex, index) => {
            if (index === 0) return null;
            const previousDot = dots[path[index - 1]];
            const currentDot = dots[dotIndex];
            return (
              <line
                key={`line-${path[index - 1]}-${dotIndex}-${index}`}
                x1={previousDot.x}
                y1={previousDot.y}
                x2={currentDot.x}
                y2={currentDot.y}
                className="pattern-lock-line"
              />
            );
          })}

          {drawing && cursor && path.length > 0 ? (
            <line
              x1={dots[path[path.length - 1]].x}
              y1={dots[path[path.length - 1]].y}
              x2={cursor.x}
              y2={cursor.y}
              className="pattern-lock-line pattern-lock-line-active"
            />
          ) : null}
        </svg>

        <div className="pattern-lock-grid" aria-hidden="true">
          {dots.map((_, index) => (
            <span key={`dot-${index}`} className="pattern-lock-cell">
              <span
                ref={(node) => {
                  nodeRefs.current[index] = node;
                }}
                className={`pattern-lock-node${activeDots.has(index) ? " is-active" : ""}`}
                data-index={index}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
