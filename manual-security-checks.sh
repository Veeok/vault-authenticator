#!/usr/bin/env bash
set -euo pipefail

pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "allows first-run setup when locked but no credentials are configured"
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "allows recovery unlock via lock:redeemBackupCode while locked"
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "blocks lock:generateBackupCodes while locked with configured credentials"
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "allows backup-code generation when unlocked and trusted"
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "blocks passkey mutation channels while locked"
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "allows passkey management when unlocked and trusted"
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "keeps passkey unlock channels available while locked for trusted sender"
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts --testNamePattern "rejects untrusted sender for passkey unlock channels"
