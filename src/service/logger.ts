// src/services/logger.ts
import winston from "winston";
import path from "path";

const logDir = path.join(process.cwd(), "logs");

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      ({ timestamp, level, message, ...meta }) =>
        `[${timestamp}] ${level.toUpperCase()}: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta) : ""
        }`,
    ),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, "bell-error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "bell-combined.log"),
    }),
  ],
});
