type Level = 'info' | 'warn' | 'error' | 'debug';

function format(level: Level, scope: string, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return `${base} <unserializable meta>`;
  }
}

export function createLogger(scope: string) {
  return {
    info: (msg: string, meta?: unknown) => console.log(format('info', scope, msg, meta)),
    warn: (msg: string, meta?: unknown) => console.warn(format('warn', scope, msg, meta)),
    error: (msg: string, meta?: unknown) => console.error(format('error', scope, msg, meta)),
    debug: (msg: string, meta?: unknown) => {
      if (process.env.DEBUG) console.log(format('debug', scope, msg, meta));
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
