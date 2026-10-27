import { defineConfig, devices } from "@playwright/test";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const defaultBrowserExecutable = chromium.executablePath();
const browserRevision = path.basename(path.dirname(path.dirname(defaultBrowserExecutable))).replace("chromium-", "");
const browserCacheRoots = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : undefined,
  path.join(os.homedir(), "AppData", "Local", "ms-playwright"),
].filter((root): root is string => Boolean(root));
const browserExecutable = process.platform === "win32"
  ? browserCacheRoots
      .map((root) => path.join(root, `chromium_headless_shell-${browserRevision}`, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
      .find(existsSync)
  : undefined;

export default defineConfig({
  testDir: ".",
  testMatch: "orders-view.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: browserExecutable
      ? { executablePath: browserExecutable, args: ["--disable-logging", "--log-level=3"] }
      : undefined,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  outputDir: path.join(os.tmpdir(), "botw-playwright-results"),
});
