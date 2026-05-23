import { env } from "./env";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
    level: LogLevel;
    timestamp: string;
    message: string;
    service?: string;
    requestId?: string;
    data?: Record<string, unknown>;
}

function format(entry: LogEntry): string {
    if (env.NODE_ENV === "test") return `${entry.level}: ${entry.message}`;

    const obj = {
        ts: entry.timestamp,
        lvl: entry.level,
        msg: entry.message,
        ...(entry.service && { svc: entry.service }),
        ...(entry.requestId && { rid: entry.requestId }),
        ...(entry.data && { ...entry.data }),
    };
    return JSON.stringify(obj);
}

export const logger = {
    debug(message: string, data?: Record<string, unknown>) {
        if (env.NODE_ENV === "production") return;
        console.log(
            format({
                level: "debug",
                timestamp: new Date().toISOString(),
                message,
                data,
            }),
        );
    },

    info(message: string, data?: Record<string, unknown>) {
        console.log(
            format({
                level: "info",
                timestamp: new Date().toISOString(),
                message,
                data,
            }),
        );
    },

    warn(message: string, data?: Record<string, unknown>) {
        console.warn(
            format({
                level: "warn",
                timestamp: new Date().toISOString(),
                message,
                data,
            }),
        );
    },

    error(message: string, data?: Record<string, unknown>, error?: Error) {
        console.error(
            format({
                level: "error",
                timestamp: new Date().toISOString(),
                message,
                data: {
                    ...(data || {}),
                    ...(error && { error: error.message, stack: error.stack }),
                },
            }),
        );
    },
};
