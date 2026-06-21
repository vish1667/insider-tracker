// Tiny structured-ish logger. Keeps cron output readable without a dependency.

type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const tail = extra ? " " + JSON.stringify(extra) : "";
  const line = `${ts} [${level.toUpperCase()}] ${msg}${tail}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
};
