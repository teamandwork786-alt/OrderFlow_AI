import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body",
      "res.headers.set-cookie",
      "token",
      "id_token",
      "access_token",
      "email",
      "name",
      "phone",
      "address"
    ],
    censor: "[REDACTED]"
  }
});
