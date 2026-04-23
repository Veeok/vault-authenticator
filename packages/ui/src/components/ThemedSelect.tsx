import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { combineMotionPresets, resolveMotionState, useMotionVariants, useResolvedMotionMode } from "../lib/motion";

export interface ThemedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props {
  value: string;
  options: readonly ThemedSelectOption[];
  onChange(next: string): void;
  ariaLabel: string;
  disabled?: boolean;
}

const MENU_OFFSET_PX = 6;
const MENU_VIEWPORT_PADDING_PX = 10;

function findNextEnabledValue(options: readonly ThemedSelectOption[], current: string, step: 1 | -1): string | null {
  const enabled = options.filter((option) => !option.disabled);
  if (!enabled.length) return null;

  const currentIndex = enabled.findIndex((option) => option.value === current);
  if (currentIndex < 0) {
    return step === 1 ? enabled[0].value : enabled[enabled.length - 1].value;
  }

  const nextIndex = (currentIndex + step + enabled.length) % enabled.length;
  return enabled[nextIndex].value;
}

export function ThemedSelect({ value, options, onChange, ariaLabel, disabled = false }: Props) {
  const [open, setOpen] = React.useState(false);
  const [menuExiting, setMenuExiting] = React.useState(false);
  const [menuReady, setMenuReady] = React.useState(false);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const listboxId = React.useId();
  const motionVariants = useMotionVariants();
  const resolvedMotionMode = useResolvedMotionMode();
  const menuPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const menuMotionDurationMs = resolvedMotionMode === "off" ? 0 : resolvedMotionMode === "reduced" ? 120 : 220;

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

  const openMenu = React.useCallback(() => {
    if (disabled) return;
    clearCloseTimer();
    setMenuExiting(false);
    setOpen(true);
  }, [clearCloseTimer, disabled]);

  const closeMenu = React.useCallback(
    (restoreFocus = false) => {
      if (!open && !menuExiting) {
        if (restoreFocus) {
          triggerRef.current?.focus();
        }
        return;
      }

      clearCloseTimer();
      setOpen(false);

      if (menuMotionDurationMs === 0) {
        setMenuExiting(false);
        if (restoreFocus) {
          triggerRef.current?.focus();
        }
        return;
      }

      setMenuExiting(true);
      closeTimerRef.current = window.setTimeout(() => {
        setMenuExiting(false);
        closeTimerRef.current = null;
        if (restoreFocus) {
          triggerRef.current?.focus();
        }
      }, menuMotionDurationMs);
    },
    [clearCloseTimer, menuExiting, menuMotionDurationMs, open]
  );

  const menuVisible = open || menuExiting;

  const selected = React.useMemo(
    () => options.find((option) => option.value === value) ?? options.find((option) => !option.disabled) ?? options[0],
    [options, value]
  );

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      closeMenu();
    };

    const onWindowBlur = () => closeMenu();

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [closeMenu]);

  React.useEffect(() => {
    if (!disabled) return;
    if (!open && !menuExiting) return;
    closeMenu();
  }, [closeMenu, disabled, menuExiting, open]);

  const updateMenuPosition = React.useCallback(() => {
    if (!menuVisible) return;

    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const menuWidth = Math.max(Math.round(triggerRect.width), Math.round(menuRect.width || triggerRect.width));
    const menuHeight = Math.round(menuRect.height || 0);

    let left = Math.round(triggerRect.left);
    const maxLeft = viewportWidth - MENU_VIEWPORT_PADDING_PX - menuWidth;
    left = maxLeft <= MENU_VIEWPORT_PADDING_PX ? MENU_VIEWPORT_PADDING_PX : Math.min(Math.max(left, MENU_VIEWPORT_PADDING_PX), maxLeft);

    let top = Math.round(triggerRect.bottom + MENU_OFFSET_PX);
    if (menuHeight > 0 && top + menuHeight > viewportHeight - MENU_VIEWPORT_PADDING_PX) {
      const upwardTop = Math.round(triggerRect.top - menuHeight - MENU_OFFSET_PX);
      if (upwardTop >= MENU_VIEWPORT_PADDING_PX) {
        top = upwardTop;
      } else {
        top = Math.max(MENU_VIEWPORT_PADDING_PX, viewportHeight - MENU_VIEWPORT_PADDING_PX - menuHeight);
      }
    }

    setMenuStyle({
      left: `${left}px`,
      top: `${top}px`,
      width: `${menuWidth}px`,
    });
    setMenuReady(true);
  }, [menuVisible]);

  React.useLayoutEffect(() => {
    if (!menuVisible) return;

    let frame1 = 0;
    let frame2 = 0;
    setMenuReady(false);

    frame1 = window.requestAnimationFrame(() => {
      updateMenuPosition();
      frame2 = window.requestAnimationFrame(() => {
        updateMenuPosition();
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [menuVisible, updateMenuPosition]);

  React.useEffect(() => {
    if (!menuVisible) return;

    const onViewportChange = () => {
      updateMenuPosition();
    };

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [menuVisible, updateMenuPosition]);

  const chooseValue = React.useCallback(
    (next: string) => {
      onChange(next);
      closeMenu(true);
    },
    [closeMenu, onChange]
  );

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        closeMenu();
      } else {
        openMenu();
      }
      return;
    }

    if (event.key === "Escape") {
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
      const next = findNextEnabledValue(options, value, step);
      if (next) onChange(next);
      openMenu();
    }
  };

  const portalTarget =
    typeof document === "undefined"
      ? null
      : ((rootRef.current?.closest(".auth-root") as HTMLElement | null) ?? document.body);

  return (
    <div
      ref={rootRef}
      className={`auth-select-wrap ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`.trim()}
        onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Escape") return;
          closeMenu(true);
        }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="auth-select ui-focus"
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={menuVisible}
        aria-controls={menuVisible ? listboxId : undefined}
        disabled={disabled}
      >
        <span className="auth-select-value">{selected?.label ?? ""}</span>
        <span className="auth-select-caret" aria-hidden="true" />
      </button>

      {menuVisible && portalTarget ? (
        createPortal(
          <motion.div
            ref={menuRef}
            id={listboxId}
            className="auth-select-menu"
            role="listbox"
            aria-label={ariaLabel}
            style={menuReady ? menuStyle : { ...menuStyle, visibility: "hidden" }}
            initial={menuPresence.initial}
            animate={resolveMotionState(menuPresence, menuExiting)}
            exit={menuPresence.exit}
            variants={menuPresence.variants}
            transition={menuPresence.transition}
            onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              closeMenu(true);
            }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={`auth-select-option ${value === option.value ? "is-selected" : ""}`.trim()}
                onClick={() => {
                  if (option.disabled) return;
                  chooseValue(option.value);
                }}
                disabled={option.disabled}
              >
                {option.label}
              </button>
            ))}
          </motion.div>,
          portalTarget
        )
      ) : null}
    </div>
  );
}
