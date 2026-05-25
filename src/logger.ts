export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  event: string;
  data?: Record<string, unknown>;
};

export type Logger = {
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
};

export function createLogger(sink: (entry: LogEntry) => void = console.log): Logger {
  const write = (level: LogLevel, event: string, data?: Record<string, unknown>) => {
    sink({ level, event, data });
  };

  return {
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data)
  };
}
