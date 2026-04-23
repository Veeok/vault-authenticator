import { useState, useEffect, useCallback, useRef } from "react";
import type { AccountMeta } from "@authenticator/core";
import type { Bridge } from "../bridge";

function optimisticId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAccounts(bridge: Bridge, enabled = true, onError?: (error: unknown) => void) {
  const [accounts, setAccounts] = useState<AccountMeta[]>([]);
  const [optimisticAccounts, setOptimisticAccounts] = useState<AccountMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    const shouldShowLoader = !hasLoadedRef.current;
    if (shouldShowLoader) {
      setLoading(true);
    }

    try {
      const list = await bridge.list();
      setAccounts(list);
    } catch (error) {
      setAccounts([]);
      onError?.(error);
    } finally {
      hasLoadedRef.current = true;
      if (shouldShowLoader) {
        setLoading(false);
      }
    }
  }, [bridge, onError]);

  useEffect(() => {
    if (!enabled) {
      hasLoadedRef.current = false;
      setLoading(false);
      setAccounts([]);
      setOptimisticAccounts([]);
      return;
    }

    void refresh();
  }, [enabled, refresh]);

  const addUri = useCallback(
    async (uri: string) => {
      const tempId = optimisticId("optimistic-uri");
      setOptimisticAccounts((prev) => [
        ...prev,
        {
          id: tempId,
          issuer: "Adding...",
          label: "Processing URI",
          digits: 6,
          period: 30,
        },
      ]);

      try {
        await bridge.addUri(uri);
        await refresh();
      } catch (error) {
        onError?.(error);
        throw error;
      } finally {
        setOptimisticAccounts((prev) => prev.filter((account) => account.id !== tempId));
      }
    },
    [bridge, onError, refresh]
  );

  const addManual = useCallback(
    async (payload: Parameters<Bridge["addManual"]>[0]) => {
      const tempId = optimisticId("optimistic-manual");
      setOptimisticAccounts((prev) => [
        ...prev,
        {
          id: tempId,
          issuer: payload.issuer.trim() || "Adding...",
          label: payload.label.trim() || "Adding...",
          digits: payload.digits,
          period: payload.period,
        },
      ]);

      try {
        await bridge.addManual(payload);
        await refresh();
      } catch (error) {
        onError?.(error);
        throw error;
      } finally {
        setOptimisticAccounts((prev) => prev.filter((account) => account.id !== tempId));
      }
    },
    [bridge, onError, refresh]
  );

  const del = useCallback(
    async (id: string) => {
      try {
        await bridge.del(id);
        await refresh();
      } catch (error) {
        onError?.(error);
        throw error;
      }
    },
    [bridge, onError, refresh]
  );

  const updateAccount = useCallback(
    async (id: string, payload: Parameters<Bridge["updateAccount"]>[1]) => {
      try {
        await bridge.updateAccount(id, payload);
        await refresh();
      } catch (error) {
        onError?.(error);
        throw error;
      }
    },
    [bridge, onError, refresh]
  );

  const reorderAccounts = useCallback(
    async (ids: string[]) => {
      try {
        if (bridge.reorderAccounts) {
          const reordered = await bridge.reorderAccounts(ids);
          setAccounts(reordered);
          return reordered;
        }

        setAccounts((previous) => {
          const byId = new Map(previous.map((account) => [account.id, account]));
          return ids.map((id) => byId.get(id)).filter((account): account is AccountMeta => Boolean(account));
        });
        const byId = new Map(accounts.map((account) => [account.id, account]));
        return ids.map((id) => byId.get(id)).filter((account): account is AccountMeta => Boolean(account));
      } catch (error) {
        onError?.(error);
        throw error;
      }
    },
    [accounts, bridge, onError]
  );

  return { accounts, optimisticAccounts, loading, addUri, addManual, del, updateAccount, reorderAccounts, refresh };
}
