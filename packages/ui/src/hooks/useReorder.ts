import * as React from "react";
import { useResolvedMotionMode } from "../lib/motion";

type ReorderMode = "vertical" | "free";
type DragHandleProps = Pick<React.DOMAttributes<HTMLElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture">;

type DragItemProps = {
  style: React.CSSProperties;
  ref: (node: HTMLElement | null) => void;
  "data-dragging": "true" | undefined;
};

type DragState = {
  id: string;
  pointerId: number;
  handle: HTMLElement;
  sourceIndex: number;
  targetIndex: number;
  startX: number;
  startY: number;
  ids: string[];
  itemRects: Map<string, DOMRect>;
  slotRects: DOMRect[];
  container: HTMLElement;
};

type PendingFlip = {
  dragId: string;
  rects: Map<string, DOMRect>;
};

const REORDER_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function idsEqual<T extends { id: string }>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.id !== right[index]?.id) {
      return false;
    }
  }
  return true;
}

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(to, copy.length)), 0, moved);
  return copy;
}

function setNodeTransition(node: HTMLElement, durationMs: number): void {
  if (durationMs <= 0) {
    node.style.transition = "none";
    return;
  }
  node.style.transition = `transform ${durationMs}ms ${REORDER_EASING}, box-shadow ${durationMs}ms ${REORDER_EASING}`;
}

function clearNodeTransform(node: HTMLElement): void {
  node.style.transform = "";
  node.style.zIndex = "";
  node.classList.remove("is-dragging", "is-reorder-target");
}

function ensureIndicator(container: HTMLElement): HTMLDivElement {
  let indicator = container.querySelector<HTMLDivElement>(":scope > .auth-reorder-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "auth-reorder-indicator";
    container.appendChild(indicator);
  }
  return indicator;
}

export function useReorder<T extends { id: string }>(
  items: T[],
  onReorder: (reordered: T[]) => void,
  mode: ReorderMode
): {
  orderedItems: T[];
  getDragHandleProps: (id: string) => DragHandleProps;
  getDragItemProps: (id: string) => DragItemProps;
} {
  const resolvedMotionMode = useResolvedMotionMode();
  const durationMs = resolvedMotionMode === "off" ? 0 : resolvedMotionMode === "reduced" ? 80 : 180;
  const dragScale = resolvedMotionMode === "full" ? 1.03 : 1;
  const [orderedItems, setOrderedItems] = React.useState<T[]>(items);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const itemNodesRef = React.useRef(new Map<string, HTMLElement>());
  const dragStateRef = React.useRef<DragState | null>(null);
  const orderedItemsRef = React.useRef<T[]>(items);
  const pendingFlipRef = React.useRef<PendingFlip | null>(null);

  React.useEffect(() => {
    orderedItemsRef.current = orderedItems;
  }, [orderedItems]);

  React.useEffect(() => {
    if (dragStateRef.current) {
      return;
    }
    if (!idsEqual(orderedItemsRef.current, items)) {
      setOrderedItems(items);
    }
  }, [items]);

  const cleanupIndicator = React.useCallback((container?: HTMLElement | null) => {
    if (!container) return;
    const indicator = container.querySelector<HTMLElement>(":scope > .auth-reorder-indicator");
    if (!indicator) return;
    indicator.style.opacity = "0";
    indicator.style.width = "0";
    indicator.style.height = "0";
    indicator.removeAttribute("data-mode");
  }, []);

  const clearTransientStyles = React.useCallback((ids: string[]) => {
    ids.forEach((id) => {
      const node = itemNodesRef.current.get(id);
      if (!node) return;
      clearNodeTransform(node);
    });
  }, []);

  const applyFreeTargetHighlight = React.useCallback((projectedIds: string[], targetIndex: number, dragId: string) => {
    const highlightId = projectedIds[targetIndex] ?? null;
    projectedIds.forEach((id) => {
      if (id === dragId) return;
      const node = itemNodesRef.current.get(id);
      if (!node) return;
      node.classList.toggle("is-reorder-target", id === highlightId);
    });
  }, []);

  const applyProjectedLayout = React.useCallback(
    (drag: DragState) => {
      const projectedIds = moveItem(drag.ids, drag.sourceIndex, drag.targetIndex);
      projectedIds.forEach((id, slotIndex) => {
        const node = itemNodesRef.current.get(id);
        if (!node || id === drag.id) return;
        const originRect = drag.itemRects.get(id);
        const targetRect = drag.slotRects[slotIndex];
        if (!originRect || !targetRect) return;

        setNodeTransition(node, durationMs);
        const deltaX = targetRect.left - originRect.left;
        const deltaY = targetRect.top - originRect.top;
        node.style.transform = deltaX || deltaY ? `translate3d(${deltaX}px, ${deltaY}px, 0)` : "";
      });

      if (mode === "free") {
        applyFreeTargetHighlight(projectedIds, drag.targetIndex, drag.id);
        cleanupIndicator(drag.container);
        return;
      }

      const indicator = ensureIndicator(drag.container);
      const containerRect = drag.container.getBoundingClientRect();
      const slots = drag.slotRects;
      const top =
        drag.targetIndex <= 0
          ? slots[0]?.top ?? containerRect.top
          : drag.targetIndex >= slots.length
            ? slots[slots.length - 1]?.bottom ?? containerRect.bottom
            : (slots[drag.targetIndex - 1].bottom + slots[drag.targetIndex].top) / 2;

      indicator.dataset.mode = "vertical";
      indicator.style.opacity = "1";
      indicator.style.left = "0px";
      indicator.style.width = "100%";
      indicator.style.height = "2px";
      indicator.style.top = `${Math.round(top - containerRect.top)}px`;
    },
    [applyFreeTargetHighlight, cleanupIndicator, durationMs, mode]
  );

  const computeTargetIndex = React.useCallback((drag: DragState, deltaX: number, deltaY: number): number => {
    if (mode === "vertical") {
      const draggedRect = drag.itemRects.get(drag.id);
      if (!draggedRect) return drag.sourceIndex;
      const centerY = draggedRect.top + deltaY + draggedRect.height / 2;
      const nonDraggedRects = drag.ids.filter((id) => id !== drag.id).map((id) => drag.itemRects.get(id)).filter(Boolean) as DOMRect[];
      for (let index = 0; index < nonDraggedRects.length; index += 1) {
        const rect = nonDraggedRects[index];
        if (centerY < rect.top + rect.height / 2) {
          return index;
        }
      }
      return nonDraggedRects.length;
    }

    const draggedRect = drag.itemRects.get(drag.id);
    if (!draggedRect) return drag.sourceIndex;
    const centerX = draggedRect.left + deltaX + draggedRect.width / 2;
    const centerY = draggedRect.top + deltaY + draggedRect.height / 2;
    let closestIndex = drag.sourceIndex;
    let closestDistance = Number.POSITIVE_INFINITY;

    drag.slotRects.forEach((rect, index) => {
      const slotCenterX = rect.left + rect.width / 2;
      const slotCenterY = rect.top + rect.height / 2;
      const distance = Math.hypot(centerX - slotCenterX, centerY - slotCenterY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  }, [mode]);

  const finishDrag = React.useCallback(
    (cancelled: boolean) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      if (drag.handle.hasPointerCapture?.(drag.pointerId)) {
        drag.handle.releasePointerCapture(drag.pointerId);
      }

      const draggedNode = itemNodesRef.current.get(drag.id);
      if (cancelled || drag.targetIndex === drag.sourceIndex) {
        clearTransientStyles(drag.ids);
        cleanupIndicator(drag.container);
        if (draggedNode) {
          setNodeTransition(draggedNode, durationMs);
          draggedNode.style.transform = "";
        }
        dragStateRef.current = null;
        setDraggingId(null);
        return;
      }

      const currentItems = orderedItemsRef.current;
      const reordered = moveItem(currentItems, drag.sourceIndex, drag.targetIndex);
      const beforeRects = new Map<string, DOMRect>();
      drag.ids.forEach((id) => {
        const node = itemNodesRef.current.get(id);
        if (!node) return;
        beforeRects.set(id, node.getBoundingClientRect());
      });

      pendingFlipRef.current = {
        dragId: drag.id,
        rects: beforeRects,
      };

      cleanupIndicator(drag.container);
      clearTransientStyles(drag.ids);
      dragStateRef.current = null;
      setDraggingId(null);
      setOrderedItems(reordered);
      onReorder(reordered);
    },
    [cleanupIndicator, clearTransientStyles, durationMs, onReorder]
  );

  React.useLayoutEffect(() => {
    const pending = pendingFlipRef.current;
    if (!pending) return;
    pendingFlipRef.current = null;

    orderedItems.forEach((item) => {
      const node = itemNodesRef.current.get(item.id);
      const previousRect = pending.rects.get(item.id);
      if (!node || !previousRect) return;

      node.style.transition = "none";
      node.style.transform = "";
      const nextRect = node.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (!deltaX && !deltaY) return;

      node.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
      window.requestAnimationFrame(() => {
        setNodeTransition(node, durationMs);
        node.style.transform = "";
      });
    });
  }, [durationMs, orderedItems]);

  React.useEffect(
    () => () => {
      const drag = dragStateRef.current;
      if (drag) {
        cleanupIndicator(drag.container);
        clearTransientStyles(drag.ids);
      }
    },
    [cleanupIndicator, clearTransientStyles]
  );

  const getDragHandleProps = React.useCallback(
    (id: string): DragHandleProps => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
          return;
        }

        const node = itemNodesRef.current.get(id);
        const container = node?.parentElement as HTMLElement | null;
        if (!node || !container) {
          return;
        }

        const ids = orderedItemsRef.current.map((item) => item.id);
        const sourceIndex = ids.indexOf(id);
        if (sourceIndex < 0) {
          return;
        }

        event.preventDefault();
        const handle = event.currentTarget as HTMLElement;
        handle.setPointerCapture(event.pointerId);

        const itemRects = new Map<string, DOMRect>();
        ids.forEach((itemId) => {
          const itemNode = itemNodesRef.current.get(itemId);
          if (!itemNode) return;
          itemRects.set(itemId, itemNode.getBoundingClientRect());
          itemNode.classList.remove("is-reorder-target");
        });

        dragStateRef.current = {
          id,
          pointerId: event.pointerId,
          handle,
          sourceIndex,
          targetIndex: sourceIndex,
          startX: event.clientX,
          startY: event.clientY,
          ids,
          itemRects,
          slotRects: ids.map((itemId) => itemRects.get(itemId)!).filter(Boolean),
          container,
        };

        setDraggingId(id);
        node.classList.add("is-dragging");
        node.style.zIndex = "3";
        node.style.transition = "none";
        ensureIndicator(container);
        cleanupIndicator(container);
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        const draggedNode = itemNodesRef.current.get(drag.id);
        if (!draggedNode) return;

        const deltaX = mode === "vertical" ? 0 : event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;
        draggedNode.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${dragScale})`;

        const nextTargetIndex = computeTargetIndex(drag, deltaX, deltaY);
        if (nextTargetIndex !== drag.targetIndex) {
          drag.targetIndex = nextTargetIndex;
        }

        applyProjectedLayout(drag);
      },
      onPointerUp: () => {
        finishDrag(false);
      },
      onPointerCancel: () => {
        finishDrag(true);
      },
      onLostPointerCapture: () => {
        finishDrag(false);
      },
    }),
    [applyProjectedLayout, cleanupIndicator, computeTargetIndex, dragScale, finishDrag, mode]
  );

  const getDragItemProps = React.useCallback(
    (id: string): DragItemProps => ({
      style: {
        "--reorder-duration": `${durationMs}ms`,
        "--reorder-scale": String(dragScale),
      } as React.CSSProperties,
      ref: (node) => {
        if (node) {
          itemNodesRef.current.set(id, node);
          return;
        }
        itemNodesRef.current.delete(id);
      },
      "data-dragging": draggingId === id ? "true" : undefined,
    }),
    [dragScale, draggingId, durationMs]
  );

  return {
    orderedItems,
    getDragHandleProps,
    getDragItemProps,
  };
}
