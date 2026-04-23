import type { ForgeConfig } from "@electron-forge/shared-types";
import MakerNSIS from "@electron-addons/electron-forge-maker-nsis";
import { MakerZIP } from "@electron-forge/maker-zip";
import AutoUnpackNativesPlugin from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const ARGON2_PACKAGE = "@node-rs/argon2";
const WINDOWS_ARGON2_NATIVE_BY_ARCH: Record<string, string> = {
  x64: "@node-rs/argon2-win32-x64-msvc",
  arm64: "@node-rs/argon2-win32-arm64-msvc",
  ia32: "@node-rs/argon2-win32-ia32-msvc",
};

const workspaceNodeModulesPath = path.resolve(__dirname, "../../node_modules");
const releaseWarnings = new Set<string>();
const lifecycleEvent = process.env.npm_lifecycle_event ?? "";
const shouldWarnForPackaging = lifecycleEvent === "package" || lifecycleEvent === "make" || lifecycleEvent === "publish";

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function warnRelease(message: string): void {
  if (!shouldWarnForPackaging || releaseWarnings.has(message)) return;
  releaseWarnings.add(message);
  console.warn(`[release-integrity] ${message}`);
}

function createWindowsSignConfig() {
  const certificateFile = envValue("WINDOWS_CERTIFICATE_FILE");
  const certificatePassword = envValue("WINDOWS_CERTIFICATE_PASSWORD");
  const signWithParams = envValue("WINDOWS_SIGN_WITH_PARAMS");
  if (!certificateFile) {
    warnRelease("Windows signing disabled: set WINDOWS_CERTIFICATE_FILE to sign packaged binaries and NSIS installers.");
    return undefined;
  }
  if (!certificatePassword && !signWithParams) {
    warnRelease(
      "Windows signing disabled: set WINDOWS_CERTIFICATE_PASSWORD or WINDOWS_SIGN_WITH_PARAMS alongside WINDOWS_CERTIFICATE_FILE."
    );
    return undefined;
  }

  const timestampServer = envValue("WINDOWS_TIMESTAMP_SERVER");
  const description = envValue("WINDOWS_SIGN_DESCRIPTION");
  const website = envValue("WINDOWS_SIGN_WEBSITE");

  return {
    certificateFile,
    ...(certificatePassword ? { certificatePassword } : {}),
    ...(signWithParams ? { signWithParams } : {}),
    ...(timestampServer ? { timestampServer } : {}),
    ...(description ? { description } : {}),
    ...(website ? { website } : {}),
  };
}

function createOsxSignConfig() {
  const identity = envValue("APPLE_SIGN_IDENTITY");
  if (!identity) {
    if (process.platform === "darwin") {
      warnRelease("macOS signing disabled: set APPLE_SIGN_IDENTITY to sign darwin builds.");
    }
    return undefined;
  }

  return {
    identity,
    hardenedRuntime: true,
  };
}

function createOsxNotarizeConfig() {
  const appleApiKey = envValue("APPLE_API_KEY");
  const appleApiKeyId = envValue("APPLE_API_KEY_ID");
  const appleApiIssuer = envValue("APPLE_API_ISSUER");
  if (appleApiKey && appleApiKeyId && appleApiIssuer) {
    return {
      appleApiKey,
      appleApiKeyId,
      appleApiIssuer,
    };
  }

  const appleId = envValue("APPLE_ID");
  const appleIdPassword = envValue("APPLE_APP_SPECIFIC_PASSWORD");
  const teamId = envValue("APPLE_TEAM_ID");
  if (appleId && appleIdPassword && teamId) {
    return {
      appleId,
      appleIdPassword,
      teamId,
    };
  }

  if (process.platform === "darwin") {
    warnRelease(
      "macOS notarization disabled: set APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID for release builds."
    );
  }
  return undefined;
}

const windowsSignConfig = createWindowsSignConfig();
const osxSignConfig = createOsxSignConfig();
const osxNotarizeConfig = osxSignConfig ? createOsxNotarizeConfig() : undefined;
const enableZipMaker = envValue("ENABLE_FORGE_ZIP_MAKER") === "1";

if (!enableZipMaker) {
  warnRelease("ZIP maker disabled by default: set ENABLE_FORGE_ZIP_MAKER=1 to opt in once the local cross-zip runtime issue is resolved.");
}

async function copyRuntimeDependency(buildPath: string, dependencyName: string): Promise<void> {
  const parts = dependencyName.split("/");
  const sourcePath = path.join(workspaceNodeModulesPath, ...parts);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing runtime dependency for packaging: ${dependencyName}`);
  }

  const destinationPath = path.join(buildPath, "node_modules", ...parts);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, {
    recursive: true,
    dereference: true,
    force: true,
    filter: (entry) => {
      const relativePath = path.relative(sourcePath, entry);
      if (!relativePath || relativePath === "") {
        return true;
      }
      const normalized = relativePath.replace(/\\/g, "/");
      const baseName = path.basename(entry).toLowerCase();
      if (baseName === "package.json") {
        return true;
      }
      if (/\.(js|cjs|mjs|json|node|wasm|dll)$/i.test(baseName)) {
        return true;
      }
      // Keep directory traversal intact but skip non-runtime payloads.
      return !normalized.includes(".");
    },
  });
}

const config: ForgeConfig = {
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath, _electronVersion, platform, arch) => {
      if (platform !== "win32") {
        return;
      }

      const nativePackage = WINDOWS_ARGON2_NATIVE_BY_ARCH[String(arch)];
      await copyRuntimeDependency(buildPath, ARGON2_PACKAGE);
      if (nativePackage) {
        await copyRuntimeDependency(buildPath, nativePackage);
      }
    },
  },
  packagerConfig: {
    asar: true,
    prune: false,
    name: "Vault Authenticator",
    executableName: "Vault Authenticator",
    icon: "./assets/icon",
    extraResource: ["./assets"],
    win32metadata: {
      CompanyName: "Veok",
      FileDescription: "Vault Authenticator",
      InternalName: "Vault Authenticator",
      OriginalFilename: "Vault Authenticator.exe",
      ProductName: "Vault Authenticator",
    },
    ...(windowsSignConfig ? { windowsSign: windowsSignConfig } : {}),
    ...(osxSignConfig ? { osxSign: osxSignConfig } : {}),
    ...(osxNotarizeConfig ? { osxNotarize: osxNotarizeConfig } : {}),
  },
  rebuildConfig: {},
  makers: [
    new MakerNSIS({
      ...(windowsSignConfig ? { codesign: windowsSignConfig } : {}),
    }),
    ...(enableZipMaker ? [new MakerZIP({}, ["win32"])] : []),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
