type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const VALID_LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const rawLogLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const MIN_LEVEL: LogLevel = VALID_LOG_LEVELS.includes(rawLogLevel as LogLevel)
  ? (rawLogLevel as LogLevel)
  : "info";
if (!VALID_LOG_LEVELS.includes(rawLogLevel as LogLevel)) {
  console.warn(`[logger] Invalid LOG_LEVEL "${process.env.LOG_LEVEL}", falling back to "info"`);
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function formatMessage(level: LogLevel, context: string, message: string, data?: any): string {
  const ts = formatTimestamp();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${context}]`;
  if (data !== undefined) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

function createLogger(context: string) {
  return {
    debug: (message: string, data?: any) => {
      if (shouldLog("debug")) console.log(formatMessage("debug", context, message, data));
    },
    info: (message: string, data?: any) => {
      if (shouldLog("info")) console.log(formatMessage("info", context, message, data));
    },
    warn: (message: string, data?: any) => {
      if (shouldLog("warn")) console.warn(formatMessage("warn", context, message, data));
    },
    error: (message: string, data?: any) => {
      if (shouldLog("error")) console.error(formatMessage("error", context, message, data));
    },
  };
}

export default createLogger;
