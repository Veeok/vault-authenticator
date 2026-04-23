/*
Animation audit before rebuild (grep of packages/ui/src):

C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.responsive-layout.test.tsx:487: expect(source).toMatch(/\.totp-fill\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*transform-origin:\s*left\s+center;[^}]*transform:\s*translateZ\(0\)\s+scaleX\(var\(--totp-progress-scale,\s*0\)\);[^}]*transition:\s*transform\s+250ms\s+linear;[^}]*will-change:\s*transform;/s);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1903: const animated = target.closest(selector);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1904: if (!(animated instanceof HTMLElement)) return;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1905: animated.style.willChange = "transform";
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1910: const animated = target.closest(selector);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1911: if (!(animated instanceof HTMLElement)) return;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1912: animated.style.willChange = "auto";
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1917: const onTransitionEnd = (event: TransitionEvent) => {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1926: document.addEventListener("transitionend", onTransitionEnd);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\App.tsx:1931: document.removeEventListener("transitionend", onTransitionEnd);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:149: transition: background var(--dur-modal) var(--ease-standard), color var(--dur-base) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:678: animation: float-orb var(--dur-ambient-float) var(--ease-standard) infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:732: animation: rise-in var(--dur-modal) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:733: transition:
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:785: animation: lock-card-shake 380ms cubic-bezier(0.36, 0.07, 0.19, 0.97) 1;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:790: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:811: animation: lock-icon-pulse calc(var(--dur-slow) * 12) var(--ease-standard) infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:812: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast)
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:829: transition: opacity var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:875: animation: surface-in var(--dur-base) var(--ease-emphasis) both, lock-chip-glow calc(var(--dur-slow) * 10) var(--ease-standard) infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:876: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast)
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:887: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:902: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:922: animation: lock-icon-unlock calc(var(--dur-slow) * 3) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1040: transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1083: transition: opacity var(--dur-modal) var(--ease-standard), transform var(--dur-modal) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1090: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1147: transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1227: transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1357: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast)
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1375: animation: banner-indicator-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1379: animation: banner-indicator-out var(--dur-base) var(--ease-standard) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1488: transition: opacity var(--dur-base) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1541: transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1651: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1662: animation: indicator-status-pop var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1699: transition: opacity var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1769: transition: transform 250ms linear;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1803: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1830: animation: indicator-status-pop var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1838: animation: indicator-status-pop var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1896: transition: opacity var(--dur-modal) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1919: transition: opacity var(--dur-modal) var(--ease-standard), transform var(--dur-modal) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:1936: transition: opacity var(--dur-modal) var(--ease-standard), transform var(--dur-modal) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:2032: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:2203: transition: opacity var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-emphasis), background-color var(--dur-base) var(--ease-emphasis), border-color var(--dur-base) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:2525: animation: settings-panel-enter var(--dur-modal) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:2628: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:2736: transition: grid-template-rows var(--dur-modal) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:2774: transition: background-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3134: transition: opacity var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3138: animation: safety-ambient-shift calc(var(--dur-ambient-float) * 0.72) ease-in-out infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3142: animation: safety-icon-drift 2600ms ease-in-out infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3146: animation: safety-hero-sheen calc(var(--dur-modal) * 4.4) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3150: animation: safety-dot-fill calc(var(--dur-base) * 1.35) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3155: animation:
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3162: animation: float-arrow calc(var(--dur-arrow-float) * 1.1) ease-in-out infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3174: transition: height var(--dur-modal) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3199: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3239: transition: transform var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3263: transition:
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3393: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3415: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3457: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3508: transition: opacity var(--dur-modal) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3524: transition: opacity var(--dur-modal) var(--ease-standard), transform var(--dur-modal) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3557: animation: auth-spinner-spin var(--dur-spinner) linear infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3665: transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3721: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3799: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3836: transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3887: animation: auth-spinner-spin var(--dur-spinner) linear infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:3909: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4016: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4045: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4047: transition:
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4061: animation:
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4115: transition:
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4123: .security-passkey-status.is-animated {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4124: animation: passkey-status-pop calc(var(--dur-base) * 1.2) var(--ease-emphasis) 1;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4407: transition:
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4417: transition: opacity var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4486: transition: opacity var(--dur-modal) var(--ease-standard), transform var(--dur-modal) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4503: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4510: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4520: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4525: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4531: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4559: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4567: animation: surface-in var(--dur-base) var(--ease-emphasis) both, lock-shake var(--dur-base) var(--ease-emphasis) 1;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4571: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4614: animation: lock-dots-pulse 1200ms var(--ease-standard) infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4647: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4658: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast)
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4676: transition: transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4687: transition: transform var(--dur-fast) var(--ease-emphasis), color var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4714: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4731: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4747: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4770: transition: color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4864: transition: transform var(--dur-fast) var(--ease-emphasis), opacity var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4867: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4912: transition: transform var(--dur-fast) var(--ease-emphasis), opacity var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard),
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4921: animation: pin-dot-pop var(--dur-fast) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4955: transition: transform var(--dur-fast) var(--ease-emphasis), opacity var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4957: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:4969: transition: opacity var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5062: transition: border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard),
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5073: transition: height var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5116: transition: width var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5121: animation: float-arrow var(--dur-arrow-float) ease-in-out infinite;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5129: transition: letter-spacing var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5190: transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5199: transition: background-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5271: @keyframes lock-icon-pulse {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5283: @keyframes lock-icon-unlock {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5298: @keyframes lock-chip-glow {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5308: @keyframes lock-dots-pulse {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5320: @keyframes lock-shake {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5339: @keyframes lock-card-shake {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5361: @keyframes pin-dot-pop {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5373: @keyframes float-orb {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5383: @keyframes rise-in {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5394: @keyframes account-row-color-shift {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5404: @keyframes account-row-color-shift-compact {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5414: @keyframes account-row-glow-pulse {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5429: @keyframes auth-spinner-spin {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5438: @keyframes safety-ambient-shift {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5448: @keyframes safety-hero-sheen {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5462: @keyframes safety-dot-fill {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5477: @keyframes safety-current-dot-beacon {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5487: @keyframes safety-icon-drift {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5497: @keyframes float-arrow {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5509: @keyframes surface-in {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5520: @keyframes settings-panel-enter {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5531: @keyframes banner-indicator-in {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5546: @keyframes banner-indicator-out {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5557: @keyframes indicator-status-pop {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5569: @keyframes passkey-card-glow {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:5584: @keyframes passkey-status-pop {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6144: transition: max-height var(--dur-base) var(--ease-emphasis), opacity var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-emphasis), margin-top var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6264: transition: opacity var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6279: animation: none !important;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6284: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6292: animation: none !important;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6311: :root[data-motion="reduced"] .security-passkey-status.is-animated {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6312: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6316: animation: banner-indicator-out var(--dur-fast) var(--ease-standard) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6352: animation: none !important;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6363: transition: none !important;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6378: animation: none !important;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6383: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6391: animation: none !important;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6410: :root:not([data-motion]) .security-passkey-status.is-animated {
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6411: animation: surface-in var(--dur-base) var(--ease-emphasis) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6415: animation: banner-indicator-out var(--dur-fast) var(--ease-standard) both;
C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\packages\ui\src\ui.css:6543: transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
*/

import * as React from "react";
import type { MotionProps, TargetAndTransition, Transition, Variants } from "framer-motion";
import type { MotionMode } from "../bridge";

type ResolvedMotionMode = Exclude<MotionMode, "system">;
const IS_TEST_ENV = typeof process !== "undefined" && typeof process.env === "object" && typeof process.env.VITEST !== "undefined";

export const duration = {
  instant: 0.08,
  fast: 0.15,
  base: 0.22,
  slow: 0.35,
  enter: 0.28,
  exit: 0.18,
} as const;

export const ease = {
  standard: [0.16, 1, 0.3, 1],
  decelerate: [0, 0, 0.2, 1],
  spring: { type: "spring", stiffness: 420, damping: 36 },
  snappy: { type: "spring", stiffness: 600, damping: 42 },
} as const;

export type MotionPreset = {
  initial?: string;
  animate?: string;
  exit?: string;
  variants?: Variants;
  transition?: Transition;
  whileTap?: MotionProps["whileTap"];
  layout?: MotionProps["layout"];
};

export type MotionVariantSet = {
  fadeIn: MotionPreset;
  fadeOut: MotionPreset;
  scaleIn: MotionPreset;
  scaleOut: MotionPreset;
  slideUp: MotionPreset;
  slideDown: MotionPreset;
  stepEnterForward: MotionPreset;
  stepExitForward: MotionPreset;
  stepEnterBackward: MotionPreset;
  stepExitBackward: MotionPreset;
  fadeSlideUp: MotionPreset;
  staggerChildren: MotionPreset;
  checkmark: MotionPreset;
  expand: MotionPreset;
  collapse: MotionPreset;
  tapScale: MotionPreset;
};

export const MotionModeContext = React.createContext<MotionMode>(IS_TEST_ENV ? "off" : "system");

function readSystemReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resolveMotionMode(mode: MotionMode, prefersReducedMotion: boolean): ResolvedMotionMode {
  if (mode === "off") return "off";
  if (mode === "reduced") return "reduced";
  if (mode === "full") return "full";
  return prefersReducedMotion ? "reduced" : "full";
}

function createPreset(initial: TargetAndTransition, animate: TargetAndTransition, exit: TargetAndTransition, transition?: Transition, extras?: Partial<MotionPreset>): MotionPreset {
  return {
    initial: "initial",
    animate: "animate",
    exit: "exit",
    variants: { initial, animate, exit },
    transition,
    ...extras,
  };
}

function createFullVariants(): MotionVariantSet {
  return {
    fadeIn: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { duration: duration.enter, ease: ease.decelerate }),
    fadeOut: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 0 }, { duration: duration.exit, ease: ease.standard }),
    scaleIn: createPreset({ opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, { duration: duration.enter, ease: ease.decelerate }),
    scaleOut: createPreset({ opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96 }, { duration: duration.exit, ease: ease.standard }),
    slideUp: createPreset({ opacity: 0, y: 12 }, { opacity: 1, y: 0 }, { opacity: 1, y: 0 }, { duration: duration.enter, ease: ease.decelerate }),
    slideDown: createPreset({ opacity: 1, y: 0 }, { opacity: 1, y: 0 }, { opacity: 0, y: 12 }, { duration: duration.exit, ease: ease.standard }),
    stepEnterForward: createPreset({ opacity: 0, x: 24 }, { opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { duration: duration.enter, ease: ease.decelerate }),
    stepExitForward: createPreset({ opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { opacity: 0, x: -24 }, { duration: duration.exit, ease: ease.standard }),
    stepEnterBackward: createPreset({ opacity: 0, x: -24 }, { opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { duration: duration.enter, ease: ease.decelerate }),
    stepExitBackward: createPreset({ opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { opacity: 0, x: 24 }, { duration: duration.exit, ease: ease.standard }),
    fadeSlideUp: createPreset({ opacity: 0, y: 8 }, { opacity: 1, y: 0 }, { opacity: 0, y: 4 }, { duration: duration.base, ease: ease.decelerate }),
    staggerChildren: createPreset(
      { opacity: 1 },
      { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
      { opacity: 1, transition: { staggerChildren: 0.03, staggerDirection: -1 } }
    ),
    checkmark: createPreset({ opacity: 0, scale: 0 }, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.82 }, ease.spring),
    expand: createPreset({ opacity: 0, height: 0 }, { opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, { duration: duration.base, ease: ease.decelerate }, { layout: false }),
    collapse: createPreset({ opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, { opacity: 0, height: 0 }, { duration: duration.exit, ease: ease.standard }, { layout: false }),
    tapScale: { whileTap: { scale: 0.97 }, transition: { duration: duration.instant, ease: ease.standard } },
  };
}

function createReducedVariants(): MotionVariantSet {
  const half = (value: number) => value / 2;
  return {
    fadeIn: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { duration: half(duration.enter), ease: ease.standard }),
    fadeOut: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 0 }, { duration: half(duration.exit), ease: ease.standard }),
    scaleIn: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { duration: half(duration.enter), ease: ease.standard }),
    scaleOut: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 0 }, { duration: half(duration.exit), ease: ease.standard }),
    slideUp: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { duration: half(duration.enter), ease: ease.standard }),
    slideDown: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 0 }, { duration: half(duration.exit), ease: ease.standard }),
    stepEnterForward: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { duration: half(duration.enter), ease: ease.standard }),
    stepExitForward: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 0 }, { duration: half(duration.exit), ease: ease.standard }),
    stepEnterBackward: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { duration: half(duration.enter), ease: ease.standard }),
    stepExitBackward: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 0 }, { duration: half(duration.exit), ease: ease.standard }),
    fadeSlideUp: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { duration: half(duration.base), ease: ease.standard }),
    staggerChildren: createPreset(
      { opacity: 1 },
      { opacity: 1, transition: { staggerChildren: 0.03, delayChildren: 0.01 } },
      { opacity: 1, transition: { staggerChildren: 0.015, staggerDirection: -1 } }
    ),
    checkmark: createPreset({ opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { duration: half(duration.base), ease: ease.standard }),
    expand: createPreset({ opacity: 0, height: 0 }, { opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, { duration: half(duration.base), ease: ease.standard }, { layout: false }),
    collapse: createPreset({ opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, { opacity: 0, height: 0 }, { duration: half(duration.exit), ease: ease.standard }, { layout: false }),
    tapScale: { whileTap: { opacity: 0.92 }, transition: { duration: half(duration.instant), ease: ease.standard } },
  };
}

function createOffVariants(): MotionVariantSet {
  const none: Transition = { duration: 0 };
  return {
    fadeIn: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 1 }, none),
    fadeOut: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 1 }, none),
    scaleIn: createPreset({ opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, none),
    scaleOut: createPreset({ opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, none),
    slideUp: createPreset({ opacity: 1, y: 0 }, { opacity: 1, y: 0 }, { opacity: 1, y: 0 }, none),
    slideDown: createPreset({ opacity: 1, y: 0 }, { opacity: 1, y: 0 }, { opacity: 1, y: 0 }, none),
    stepEnterForward: createPreset({ opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { opacity: 1, x: 0 }, none),
    stepExitForward: createPreset({ opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { opacity: 1, x: 0 }, none),
    stepEnterBackward: createPreset({ opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { opacity: 1, x: 0 }, none),
    stepExitBackward: createPreset({ opacity: 1, x: 0 }, { opacity: 1, x: 0 }, { opacity: 1, x: 0 }, none),
    fadeSlideUp: createPreset({ opacity: 1, y: 0 }, { opacity: 1, y: 0 }, { opacity: 1, y: 0 }, none),
    staggerChildren: createPreset({ opacity: 1 }, { opacity: 1 }, { opacity: 1 }, none),
    checkmark: createPreset({ opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, { opacity: 1, scale: 1 }, none),
    expand: createPreset({ opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, none, { layout: false }),
    collapse: createPreset({ opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, { opacity: 1, height: "auto" }, none, { layout: false }),
    tapScale: {},
  };
}

export const fullVariants = createFullVariants();
export const reducedVariants = createReducedVariants();
export const offVariants = createOffVariants();

export function getMotionVariants(mode: MotionMode, prefersReducedMotion = false): MotionVariantSet {
  if (IS_TEST_ENV) {
    return offVariants;
  }
  const resolved = resolveMotionMode(mode, prefersReducedMotion);
  if (resolved === "off") return offVariants;
  if (resolved === "reduced") return reducedVariants;
  return fullVariants;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(readSystemReducedMotion);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);

    setPrefersReducedMotion(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  return prefersReducedMotion;
}

export function useResolvedMotionMode(): ResolvedMotionMode {
  const mode = React.useContext(MotionModeContext);
  const prefersReducedMotion = usePrefersReducedMotion();

  return React.useMemo(() => {
    if (IS_TEST_ENV) {
      return "off";
    }
    return resolveMotionMode(mode, prefersReducedMotion);
  }, [mode, prefersReducedMotion]);
}

export function useMotionVariants(): MotionVariantSet {
  const mode = React.useContext(MotionModeContext);
  const prefersReducedMotion = usePrefersReducedMotion();

  return React.useMemo(() => getMotionVariants(mode, prefersReducedMotion), [mode, prefersReducedMotion]);
}

export function combineMotionPresets(enterPreset: MotionPreset, exitPreset?: MotionPreset): MotionPreset {
  return {
    initial: enterPreset.initial,
    animate: enterPreset.animate,
    exit: exitPreset?.exit ?? enterPreset.exit,
    variants: {
      ...(enterPreset.variants ?? {}),
      ...(exitPreset?.variants ?? {}),
    },
    transition: enterPreset.transition ?? exitPreset?.transition,
    layout: enterPreset.layout ?? exitPreset?.layout,
    whileTap: enterPreset.whileTap ?? exitPreset?.whileTap,
  };
}

export function resolveMotionState(preset: MotionPreset, isExiting = false): string | undefined {
  if (isExiting && preset.exit) {
    return preset.exit;
  }
  return preset.animate;
}
