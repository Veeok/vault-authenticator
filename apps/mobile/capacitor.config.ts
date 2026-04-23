import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.authenticator",
  appName: "Authenticator",
  webDir: "dist",
  server: { androidScheme: "https" },
};

export default config;
