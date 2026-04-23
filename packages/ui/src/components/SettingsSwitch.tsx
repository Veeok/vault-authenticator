import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { combineMotionPresets, useMotionVariants } from "../lib/motion";

type SettingsSwitchProps = {
  label: React.ReactNode;
  checked: boolean;
  onChange(next: boolean): void;
  ariaLabel: string;
  disabled?: boolean;
};

export function SettingsSwitch({ label, checked, onChange, ariaLabel, disabled = false }: SettingsSwitchProps) {
  const motionVariants = useMotionVariants();
  const iconPresence = React.useMemo(() => combineMotionPresets(motionVariants.checkmark, motionVariants.fadeOut), [motionVariants]);

  return (
    <label className={`auth-field auth-field-checkbox auth-switch-field${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}`}>
      <span className="auth-switch-label">{label}</span>
      <span className="auth-switch-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="ui-focus auth-switch-input"
          aria-label={ariaLabel}
          disabled={disabled}
        />
        <span className="auth-switch-track" aria-hidden="true">
          <span className="auth-switch-thumb">
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={checked ? "on" : "off"}
                className={`auth-switch-thumb-icon${checked ? " is-on" : " is-off"}`}
                initial={iconPresence.initial}
                animate={iconPresence.animate}
                exit={iconPresence.exit}
                variants={iconPresence.variants}
                transition={iconPresence.transition}
              >
                {checked ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </span>
    </label>
  );
}
