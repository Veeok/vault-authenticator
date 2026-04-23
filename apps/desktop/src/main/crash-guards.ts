type CrashLogger = (message: string, details?: unknown) => void;

type ProcessLike = {
  on(event: "uncaughtException", listener: (error: Error) => void): void;
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

type RenderProcessGoneDetailsLike = {
  reason: string;
  exitCode: number;
};

type ChildProcessGoneDetailsLike = {
  type: string;
  reason: string;
  exitCode: number;
  serviceName?: string;
  name?: string;
};

type WebContentsLike = {
  getURL(): string;
};

type AppLike = {
  on(
    event: "render-process-gone",
    listener: (event: unknown, webContents: WebContentsLike, details: RenderProcessGoneDetailsLike) => void
  ): void;
  on(
    event: "child-process-gone",
    listener: (event: unknown, details: ChildProcessGoneDetailsLike) => void
  ): void;
};

type RegisterCrashGuardsInput = {
  processLike: ProcessLike;
  appLike: AppLike;
  log: CrashLogger;
};

export function normalizeUnhandledRejectionReason(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return {
      message: reason.message,
      stack: reason.stack,
    };
  }

  return {
    message: String(reason),
  };
}

export function registerCrashGuards(input: RegisterCrashGuardsInput): void {
  const { processLike, appLike, log } = input;

  processLike.on("uncaughtException", (error) => {
    log("process uncaughtException", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  });

  processLike.on("unhandledRejection", (reason) => {
    const normalized = normalizeUnhandledRejectionReason(reason);
    log("process unhandledRejection", normalized);
  });

  appLike.on("render-process-gone", (_event, webContents, details) => {
    log("render-process-gone", {
      reason: details.reason,
      exitCode: details.exitCode,
      url: webContents.getURL(),
    });
  });

  appLike.on("child-process-gone", (_event, details) => {
    log("child-process-gone", {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    });
  });
}
