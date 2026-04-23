import * as React from "react";
import { motion } from "framer-motion";
import type { AccountMeta } from "@authenticator/core";
import { Search } from "lucide-react";
import type { BaseThemeId } from "../bridge";
import { combineMotionPresets, resolveMotionState, useMotionVariants } from "../lib/motion";

interface CommandPaletteProps {
  theme: BaseThemeId;
  accounts: AccountMeta[];
  onCopyAccount(account: AccountMeta): Promise<void>;
  onClose(): void;
  isClosing?: boolean;
}

const QUERY_RESULT_LIMIT = 60;

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return true;
  if (normalizedText.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const char of normalizedText) {
    if (char === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      if (queryIndex >= normalizedQuery.length) {
        return true;
      }
    }
  }

  return false;
}

export function CommandPalette({ theme, accounts, onCopyAccount, onClose, isClosing = false }: CommandPaletteProps) {
  const motionVariants = useMotionVariants();
  const overlayPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const modalPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const tapScale = motionVariants.tapScale;
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const filteredAccounts = React.useMemo(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return accounts.slice(0, QUERY_RESULT_LIMIT);

    const next = accounts.filter((account) => {
      const issuer = account.issuer || "";
      const label = account.label || "";
      return fuzzyMatch(issuer, normalizedQuery) || fuzzyMatch(label, normalizedQuery);
    });
    return next.slice(0, QUERY_RESULT_LIMIT);
  }, [accounts, query]);

  React.useEffect(() => {
    if (filteredAccounts.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((previous) => {
      if (previous < 0) return 0;
      if (previous >= filteredAccounts.length) return filteredAccounts.length - 1;
      return previous;
    });
  }, [filteredAccounts]);

  const chooseAccount = React.useCallback(
    async (index: number) => {
      if (busy) return;
      const account = filteredAccounts[index];
      if (!account) return;
      setBusy(true);
      try {
        await onCopyAccount(account);
      } finally {
        setBusy(false);
      }
    },
    [busy, filteredAccounts, onCopyAccount]
  );

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (filteredAccounts.length === 0) return;
        setActiveIndex((previous) => {
          if (previous < 0) return 0;
          return (previous + 1) % filteredAccounts.length;
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (filteredAccounts.length === 0) return;
        setActiveIndex((previous) => {
          if (previous < 0) return filteredAccounts.length - 1;
          return (previous - 1 + filteredAccounts.length) % filteredAccounts.length;
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (activeIndex < 0) return;
        void chooseAccount(activeIndex);
      }
    },
    [activeIndex, chooseAccount, filteredAccounts.length, onClose]
  );

  const emptyMessage = "No matches";

  return (
    <motion.div className={`auth-overlay theme-${theme}`} onClick={onClose} role="presentation" initial={overlayPresence.initial} animate={resolveMotionState(overlayPresence, isClosing)} exit={overlayPresence.exit} variants={overlayPresence.variants} transition={overlayPresence.transition}>
      <motion.section
        className={`auth-command-palette theme-${theme}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        initial={modalPresence.initial}
        animate={resolveMotionState(modalPresence, isClosing)}
        exit={modalPresence.exit}
        variants={modalPresence.variants}
        transition={modalPresence.transition}
      >
        <header className="auth-command-header">
          <h2 className="auth-command-title">Search</h2>
          <span className="auth-command-shortcut" aria-hidden="true">
            Ctrl+K
          </span>
        </header>

        <label className="auth-command-search" htmlFor="command-palette-search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            id="command-palette-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search accounts..."
            className="auth-command-input ui-focus"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search accounts"
          />
        </label>

        <div className="auth-command-results" role="listbox" aria-label="Search results">
          {filteredAccounts.length === 0 ? (
            <p className="auth-command-empty">{emptyMessage}</p>
          ) : (
            filteredAccounts.map((account, index) => (
              <motion.button
                key={account.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`auth-command-item ui-focus${index === activeIndex ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void chooseAccount(index)}
                disabled={busy}
                whileTap={tapScale.whileTap}
                transition={tapScale.transition}
              >
                <span className="auth-command-item-issuer">{account.issuer || account.label || "Account"}</span>
                {account.issuer ? <span className="auth-command-item-label">{account.label || "Account"}</span> : null}
              </motion.button>
            ))
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
