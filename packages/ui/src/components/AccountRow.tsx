import * as React from "react";
import type { AccountMeta, CodeResult } from "@authenticator/core";
import { Check, Copy, GripVertical, Pencil, Trash2 } from "lucide-react";
import { formatCode } from "../utils/formatCode";

type DragItemProps = {
  style: React.CSSProperties;
  ref: (node: HTMLElement | null) => void;
  "data-dragging": "true" | undefined;
};

interface Props {
  account: AccountMeta;
  codeResult?: CodeResult;
  hideCompactLabels?: boolean;
  clipboardSafetyEnabled?: boolean;
  onEdit(account: AccountMeta): void;
  onDelete(account: AccountMeta): void;
  onCopyFeedback?(payload: { status: "success" | "error"; account: AccountMeta; code?: string }): void;
  index?: number;
  pending?: boolean;
  dragItemProps?: DragItemProps;
  dragHandleProps?: Pick<React.DOMAttributes<HTMLElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture">;
  dragMode?: "vertical" | "free";
  dragEnabled?: boolean;
}

type CopyState = "idle" | "copied" | "failed";

interface AccountCodeProps {
  code: string;
  remainingSeconds: number;
  totalSeconds: number;
  hideCompactLabels?: boolean;
}

interface ProgressBarProps {
  progress: number;
}

export function TotpProgressBar({ progress }: ProgressBarProps) {
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const scale = (Math.round(clamped * 1000) / 1000).toFixed(3);

  return (
    <span className="totp-progress-viewport">
      <span
        className="totp-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className="totp-fill"
          style={{
            "--totp-progress-scale": scale,
          } as React.CSSProperties}
        />
      </span>
    </span>
  );
}

const AccountCode = React.memo(function AccountCode({
  code,
  remainingSeconds,
  totalSeconds,
  hideCompactLabels,
}: AccountCodeProps) {
  const baseCode = code || "------";
  const displayCode = formatCode(baseCode);
  const safeTotalSeconds = Math.max(1, totalSeconds);
  const safeRemainingSeconds = Math.max(0, Math.min(safeTotalSeconds, remainingSeconds));
  const displayRemainingSeconds = safeRemainingSeconds;
  const progress = safeRemainingSeconds / safeTotalSeconds;

  return (
    <>
      <span className="pill-content">
        <span className="account-code-value">{displayCode}</span>
        <span className="account-code-meta-row">
          <span className="account-code-meta">{displayRemainingSeconds}s</span>
          {!hideCompactLabels ? (
            <span className="account-code-copy-hint" aria-hidden="true">
              <Copy size={10} />
              <span>Copy</span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="pill-progress-slot">
        <TotpProgressBar progress={progress} />
      </span>
    </>
  );
});

export const AccountRow = React.memo(function AccountRow({
  account,
  codeResult,
  hideCompactLabels,
  clipboardSafetyEnabled = true,
  onEdit,
  onDelete,
  onCopyFeedback,
  index = 0,
  pending = false,
  dragItemProps,
  dragHandleProps,
  dragMode = "free",
  dragEnabled = false,
}: Props) {
  const [copyState, setCopyState] = React.useState<CopyState>("idle");
  const clipboardClearTimeoutRef = React.useRef<number | null>(null);
  const copyVisualTimeoutRef = React.useRef<number | null>(null);
  const lastCopiedValueRef = React.useRef<string>("");

  const tooltipText = `${account.issuer || "Account"} — ${account.label || "Account"}`;
  const tooltipId = `tooltip-${account.id}`;
  const accountCodeValue = codeResult?.code ?? "-".repeat(account.digits);
  const accountRemainingSeconds = pending ? 0 : codeResult?.remainingSeconds ?? 0;
  const accountTotalSeconds = Math.max(1, account.period);
  const rowColorCycleDelay = `${-((index % 9) * 1.4)}s`;

  React.useEffect(() => {
    return () => {
      if (clipboardClearTimeoutRef.current) {
        window.clearTimeout(clipboardClearTimeoutRef.current);
      }
      if (copyVisualTimeoutRef.current) {
        window.clearTimeout(copyVisualTimeoutRef.current);
      }
    };
  }, []);

  const clearCopyVisualTimer = React.useCallback(() => {
    if (copyVisualTimeoutRef.current == null) return;
    window.clearTimeout(copyVisualTimeoutRef.current);
    copyVisualTimeoutRef.current = null;
  }, []);

  const clearClipboardClearTimer = React.useCallback(() => {
    if (clipboardClearTimeoutRef.current == null) return;
    window.clearTimeout(clipboardClearTimeoutRef.current);
    clipboardClearTimeoutRef.current = null;
  }, []);

  React.useEffect(() => {
    if (clipboardSafetyEnabled) {
      return;
    }
    clearClipboardClearTimer();
    lastCopiedValueRef.current = "";
  }, [clearClipboardClearTimer, clipboardSafetyEnabled]);

  const handleCopy = React.useCallback(async () => {
    if (pending || !codeResult?.code) return;

    try {
      await navigator.clipboard.writeText(codeResult.code);
      lastCopiedValueRef.current = codeResult.code;

      clearCopyVisualTimer();
      setCopyState("copied");
      onCopyFeedback?.({ status: "success", account, code: codeResult.code });

      copyVisualTimeoutRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyVisualTimeoutRef.current = null;
      }, 1000);

      clearClipboardClearTimer();
      if (clipboardSafetyEnabled) {
        clipboardClearTimeoutRef.current = window.setTimeout(async () => {
          const current = await navigator.clipboard.readText().catch(() => "");
          if (current === lastCopiedValueRef.current) {
            await navigator.clipboard.writeText("").catch((): undefined => undefined);
          }
          lastCopiedValueRef.current = "";
          clipboardClearTimeoutRef.current = null;
        }, 30_000);
      }
    } catch {
      clearCopyVisualTimer();
      setCopyState("failed");
      onCopyFeedback?.({ status: "error", account });
      copyVisualTimeoutRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyVisualTimeoutRef.current = null;
      }, 1200);
    }
  }, [account, clearClipboardClearTimer, clearCopyVisualTimer, clipboardSafetyEnabled, codeResult?.code, onCopyFeedback, pending]);

  const handleDelete = React.useCallback(() => {
    if (pending) return;
    onDelete(account);
  }, [account, onDelete, pending]);

  const handleEdit = React.useCallback(() => {
    if (pending) return;
    onEdit(account);
  }, [account, onEdit, pending]);

  return (
    <article
      ref={dragItemProps?.ref}
      className={`account-row${pending ? " is-pending" : ""}`}
      style={{ "--row-stagger-index": index, "--row-color-cycle-delay": rowColorCycleDelay, ...(dragItemProps?.style ?? {}) } as React.CSSProperties}
      data-dragging={dragItemProps?.["data-dragging"]}
      data-drag-mode={dragMode}
    >
      <div className="account-row-layout">
        <div className="account-drag-slot">
          <button
            type="button"
            className="account-drag-handle ui-focus"
            aria-label={`Reorder ${account.issuer || account.label}`}
            title="Reorder account"
            disabled={!dragEnabled}
            {...(dragEnabled ? dragHandleProps ?? {} : {})}
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="account-main" title={tooltipText} aria-describedby={tooltipId} aria-label={tooltipText} tabIndex={0}>
          <p className="account-issuer" title={account.issuer || account.label}>
            {account.issuer || account.label}
          </p>
          {account.issuer && !hideCompactLabels ? (
            <p className="account-label" title={account.label}>
              {account.label}
            </p>
          ) : null}
          <span id={tooltipId} className="auth-sr-only">
            {tooltipText}
          </span>
        </div>

        <div className="account-code-wrap">
          <button
            type="button"
            className={`account-code ui-focus ${copyState === "copied" ? "is-copied" : ""}`}
            onClick={() => void handleCopy()}
            title={pending ? "Adding account" : "Copy one-time code"}
            aria-label={pending ? "Adding account" : `Copy code for ${account.issuer || account.label}`}
            disabled={pending}
          >
            <AccountCode
              code={accountCodeValue}
              remainingSeconds={accountRemainingSeconds}
              totalSeconds={accountTotalSeconds}
              hideCompactLabels={hideCompactLabels}
            />
          </button>
        </div>

        <div className="account-actions-inline">
          <button
            type="button"
            className={`account-copy-btn ui-focus${copyState === "copied" ? " is-copied" : copyState === "failed" ? " is-failed" : ""}`}
            onClick={() => void handleCopy()}
            aria-label={copyState === "copied" ? `Copied code for ${account.issuer || account.label}` : `Copy code for ${account.issuer || account.label}`}
            title={copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
            disabled={pending}
          >
            {copyState === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span className="account-action-label">{copyState === "copied" ? "Copied" : copyState === "failed" ? "Retry" : "Copy"}</span>
          </button>
          <button
            type="button"
            className="account-edit-btn ui-focus"
            onClick={handleEdit}
            title="Edit account"
            aria-label={`Edit ${account.issuer || account.label}`}
            disabled={pending}
          >
            <Pencil size={14} aria-hidden="true" />
            <span className="account-action-label">Edit</span>
          </button>
          <button
            type="button"
            className="account-delete ui-focus"
            onClick={handleDelete}
            title="Remove account"
            aria-label={`Delete ${account.issuer || account.label}`}
            disabled={pending}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span className="account-action-label">Delete</span>
          </button>
        </div>
      </div>
    </article>
  );
});
