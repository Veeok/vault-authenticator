/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module "*.png" {
  const src: string;
  export default src;
}
