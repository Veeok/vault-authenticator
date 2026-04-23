import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Lock, Menu, Monitor, Plus, QrCode, Search, Settings2, Trash2 } from "lucide-react";
import { combineMotionPresets, resolveMotionState, useMotionVariants } from "../lib/motion";

export type SettingsCategory = "appearance" | "security" | "accounts" | "behavior" | "advanced";

const MENU_EXIT_MS = 220;
const MENU_OFFSET_PX = 10;
const VIEWPORT_PADDING_PX = 12;

type MenuAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onSelect: () => void | Promise<void>;
};

type MenuSection = {
  id: string;
  title: string;
  items: MenuAction[];
};

type IndexedMenuAction = MenuAction & {
  flatIndex: number;
};

type IndexedMenuSection = {
  id: string;
  title: string;
  items: IndexedMenuAction[];
};

type MenuPlacement = "up" | "down";

type MenuPanelPosition = {
  left: number;
  top: number;
  maxHeight: number;
  placement: MenuPlacement;
  ready: boolean;
};

interface HeaderMenuProps {
  onAddAccount(): void;
  onOpenCommandPalette(): void;
  onScanFromScreen(): void;
  onClearClipboard(): void;
  onOpenSettings(category: SettingsCategory): void;
  onLockApp(): void | Promise<void>;
  canScanFromScreen?: boolean;
}

export function HeaderMenu({
  onAddAccount,
  onOpenCommandPalette,
  onScanFromScreen,
  onClearClipboard,
  onOpenSettings,
  onLockApp,
  canScanFromScreen = true,
}: HeaderMenuProps) {
  const motionVariants = useMotionVariants();
  const panelPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const menuSections = React.useMemo<MenuSection[]>(() => {
    return [
      {
        id: "quick-actions",
        title: "Quick actions",
        items: [
          {
            id: "command-palette",
            label: "Ctrl+K Search",
            icon: <Search size={16} aria-hidden="true" />,
            enabled: true,
            onSelect: onOpenCommandPalette,
          },
          {
            id: "scan-screen",
            label: "Scan QR from Screen",
            icon: (
              <span className="auth-fab-menu-icon-stack" aria-hidden="true">
                <Monitor size={14} />
                <QrCode size={11} />
              </span>
            ),
            enabled: canScanFromScreen,
            onSelect: onScanFromScreen,
          },
          {
            id: "add-account",
            label: "Add account",
            icon: <Plus size={16} aria-hidden="true" />,
            enabled: true,
            onSelect: onAddAccount,
          },
          {
            id: "clear-clipboard",
            label: "Clear Clipboard",
            icon: <Trash2 size={16} aria-hidden="true" />,
            enabled: true,
            onSelect: onClearClipboard,
          },
          {
            id: "lock-app",
            label: "Lock app",
            icon: <Lock size={16} aria-hidden="true" />,
            enabled: true,
            onSelect: onLockApp,
          },
        ],
      },
      {
        id: "settings",
        title: "Settings",
        items: [
          {
            id: "settings-open",
            label: "Settings",
            icon: <Settings2 size={16} aria-hidden="true" />,
            enabled: true,
            onSelect: () => onOpenSettings("appearance"),
          },
        ],
      },
    ];
  }, [canScanFromScreen, onAddAccount, onClearClipboard, onLockApp, onOpenCommandPalette, onOpenSettings, onScanFromScreen]);

  const indexedSections = React.useMemo<IndexedMenuSection[]>(() => {
    let nextIndex = 0;
    return menuSections.map((section) => ({
      id: section.id,
      title: section.title,
      items: section.items.map((item) => ({
        ...item,
        flatIndex: nextIndex++,
      })),
    }));
  }, [menuSections]);

  const enabledActionIndexes = React.useMemo<number[]>(() => {
    const next: number[] = [];
    for (const section of indexedSections) {
      for (const item of section.items) {
        if (item.enabled) {
          next.push(item.flatIndex);
        }
      }
    }
    return next;
  }, [indexedSections]);

  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(enabledActionIndexes[0] ?? -1);
  const [panelVisible, setPanelVisible] = React.useState(false);
  const [panelExiting, setPanelExiting] = React.useState(false);
  const [panelPosition, setPanelPosition] = React.useState<MenuPanelPosition>({
    left: VIEWPORT_PADDING_PX,
    top: VIEWPORT_PADDING_PX,
    maxHeight: Math.max(220, (typeof window !== "undefined" ? window.innerHeight : 600) - VIEWPORT_PADDING_PX * 2),
    placement: "up",
    ready: false,
  });

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const closeTimerRef = React.useRef<number | null>(null);
  const menuId = React.useId();

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  React.useEffect(
    () => () => {
      clearCloseTimer();
    },
    [clearCloseTimer]
  );

  const closeMenu = React.useCallback(
    (restoreFocus = false) => {
      if (!panelVisible) {
        setOpen(false);
        setPanelExiting(false);
        if (restoreFocus) {
          window.setTimeout(() => triggerRef.current?.focus(), 0);
        }
        return;
      }

      clearCloseTimer();
      setPanelExiting(true);
      closeTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        setPanelVisible(false);
        setPanelExiting(false);
        if (restoreFocus) {
          window.setTimeout(() => triggerRef.current?.focus(), 0);
        }
      }, MENU_EXIT_MS);
    },
    [clearCloseTimer, panelVisible]
  );

  const openMenu = React.useCallback(
    (focusLast = false) => {
      clearCloseTimer();
      if (enabledActionIndexes.length === 0) {
        setOpen(true);
        setPanelVisible(true);
        setPanelExiting(false);
        setPanelPosition((previous) => ({ ...previous, ready: false }));
        setActiveIndex(-1);
        return;
      }

      const next = focusLast ? enabledActionIndexes[enabledActionIndexes.length - 1] : enabledActionIndexes[0];
      setActiveIndex(next);
      setOpen(true);
      setPanelVisible(true);
      setPanelExiting(false);
      setPanelPosition((previous) => ({ ...previous, ready: false }));
    },
    [clearCloseTimer, enabledActionIndexes]
  );

  const updatePanelPosition = React.useCallback(() => {
    if (!panelVisible) return;

    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = Math.max(120, viewportHeight - VIEWPORT_PADDING_PX * 2);

    const measuredWidth = panelRect.width || 248;
    const measuredHeight = Math.min(panelRect.height || maxHeight, maxHeight);

    const spaceAbove = triggerRect.top - VIEWPORT_PADDING_PX - MENU_OFFSET_PX;
    const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_PADDING_PX - MENU_OFFSET_PX;
    const placement: MenuPlacement = spaceAbove >= measuredHeight || spaceAbove >= spaceBelow ? "up" : "down";

    let top =
      placement === "up" ? triggerRect.top - measuredHeight - MENU_OFFSET_PX : triggerRect.bottom + MENU_OFFSET_PX;
    const topMin = VIEWPORT_PADDING_PX;
    const topMax = viewportHeight - VIEWPORT_PADDING_PX - measuredHeight;
    top = topMax <= topMin ? topMin : Math.min(Math.max(top, topMin), topMax);

    let left = triggerRect.right - measuredWidth;
    const leftMin = VIEWPORT_PADDING_PX;
    const leftMax = viewportWidth - VIEWPORT_PADDING_PX - measuredWidth;
    left = leftMax <= leftMin ? leftMin : Math.min(Math.max(left, leftMin), leftMax);

    setPanelPosition((previous) => {
      const nextLeft = Math.round(left);
      const nextTop = Math.round(top);
      const nextMaxHeight = Math.round(maxHeight);
      if (
        previous.left === nextLeft &&
        previous.top === nextTop &&
        previous.maxHeight === nextMaxHeight &&
        previous.placement === placement &&
        previous.ready
      ) {
        return previous;
      }
      return {
        left: nextLeft,
        top: nextTop,
        maxHeight: nextMaxHeight,
        placement,
        ready: true,
      };
    });
  }, [panelVisible]);

  const getActionByIndex = React.useCallback(
    (index: number): IndexedMenuAction | null => {
      for (const section of indexedSections) {
        for (const item of section.items) {
          if (item.flatIndex === index) {
            return item;
          }
        }
      }
      return null;
    },
    [indexedSections]
  );

  const activateIndex = React.useCallback(
    (index: number) => {
      const item = getActionByIndex(index);
      if (!item || !item.enabled) return;

      void (async () => {
        try {
          clearCloseTimer();
          setOpen(false);
          setPanelVisible(false);
          setPanelExiting(false);
          window.setTimeout(() => {
            void item.onSelect();
          }, 0);
        } finally {
          itemRefs.current = [];
        }
      })();
    },
    [clearCloseTimer, getActionByIndex]
  );

  const moveActive = React.useCallback(
    (direction: -1 | 1) => {
      if (enabledActionIndexes.length === 0) return;
      const currentPosition = enabledActionIndexes.indexOf(activeIndex);
      const basePosition = currentPosition >= 0 ? currentPosition : 0;
      const nextPosition = (basePosition + direction + enabledActionIndexes.length) % enabledActionIndexes.length;
      setActiveIndex(enabledActionIndexes[nextPosition]);
    },
    [activeIndex, enabledActionIndexes]
  );

  React.useEffect(() => {
    if (!panelVisible || panelExiting || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, panelExiting, panelVisible]);

  React.useEffect(() => {
    if (!panelVisible) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [closeMenu, panelVisible]);

  React.useLayoutEffect(() => {
    if (!panelVisible) return;
    let frame1 = 0;
    let frame2 = 0;

    frame1 = window.requestAnimationFrame(() => {
      updatePanelPosition();
      frame2 = window.requestAnimationFrame(() => {
        updatePanelPosition();
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [panelVisible, updatePanelPosition]);

  React.useEffect(() => {
    if (!panelVisible) return;
    const onViewportChange = () => {
      updatePanelPosition();
    };

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [panelVisible, updatePanelPosition]);

  React.useEffect(() => {
    if (!panelVisible) return;
    if (enabledActionIndexes.length > 0 && !enabledActionIndexes.includes(activeIndex)) {
      setActiveIndex(enabledActionIndexes[0]);
      return;
    }
    if (enabledActionIndexes.length === 0 && activeIndex !== -1) {
      setActiveIndex(-1);
    }
  }, [activeIndex, enabledActionIndexes, panelVisible]);

  const handleTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu(false);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        openMenu(true);
        return;
      }
      if (event.key === "Escape" && panelVisible) {
        event.preventDefault();
        closeMenu();
      }
    },
    [closeMenu, openMenu, panelVisible]
  );

  const handleMenuKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        if (enabledActionIndexes.length > 0) {
          setActiveIndex(enabledActionIndexes[0]);
        }
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        if (enabledActionIndexes.length > 0) {
          setActiveIndex(enabledActionIndexes[enabledActionIndexes.length - 1]);
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateIndex(activeIndex);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        moveActive(event.shiftKey ? -1 : 1);
      }
    },
    [activateIndex, activeIndex, closeMenu, enabledActionIndexes, moveActive]
  );

  const panelStyle: React.CSSProperties = {
    left: `${panelPosition.left}px`,
    top: `${panelPosition.top}px`,
    maxHeight: `${panelPosition.maxHeight}px`,
    visibility: panelPosition.ready ? "visible" : "hidden",
  };

  const panelNode = panelVisible ? (
    <div className="auth-popover-layer" role="presentation">
      <motion.div
        ref={panelRef}
        id={menuId}
        className={`auth-fab-menu-panel ${panelExiting ? "is-exiting" : "is-entering"}`}
        data-menu-placement={panelPosition.placement}
        role="menu"
        aria-label="App menu"
        onKeyDown={handleMenuKeyDown}
        style={panelStyle}
        initial={panelPresence.initial}
        animate={resolveMotionState(panelPresence, panelExiting)}
        exit={panelPresence.exit}
        variants={panelPresence.variants}
        transition={panelPresence.transition}
      >
        {indexedSections.map((section) => (
          <section key={section.id} className="auth-fab-menu-section" role="none">
            <p className="auth-fab-menu-title" role="presentation">
              {section.title}
            </p>
            {section.items.map((item) => (
              <button
                key={item.id}
                ref={(node) => {
                  itemRefs.current[item.flatIndex] = node;
                }}
                type="button"
                role="menuitem"
                disabled={!item.enabled}
                aria-disabled={!item.enabled}
                className={`auth-fab-menu-item ui-focus${item.enabled && activeIndex === item.flatIndex ? " is-active" : ""}`}
                tabIndex={item.enabled ? (activeIndex === item.flatIndex ? 0 : -1) : -1}
                onMouseEnter={() => {
                  if (!item.enabled) return;
                  setActiveIndex(item.flatIndex);
                }}
                onFocus={() => {
                  if (!item.enabled) return;
                  setActiveIndex(item.flatIndex);
                }}
                onClick={() => activateIndex(item.flatIndex)}
              >
                <span className="auth-fab-menu-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="auth-fab-menu-label">{item.label}</span>
              </button>
            ))}
          </section>
        ))}
      </motion.div>
    </div>
  ) : null;

  const portalTarget =
    typeof document === "undefined"
      ? null
      : ((triggerRef.current?.closest(".auth-root") as HTMLElement | null) ?? document.body);

  return (
    <div className="auth-fab-menu">
      <button
        ref={triggerRef}
        type="button"
        title="Menu"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={panelVisible && !panelExiting}
        aria-controls={panelVisible ? menuId : undefined}
        className={`auth-fab-trigger ui-focus${open && !panelExiting ? " is-open" : ""}`}
        onClick={() => {
          if (panelVisible && !panelExiting) {
            closeMenu();
            return;
          }
          openMenu(false);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <Menu size={20} className="auth-fab-trigger-icon" aria-hidden="true" />
      </button>

      {panelNode && portalTarget ? createPortal(panelNode, portalTarget) : null}
    </div>
  );
}
