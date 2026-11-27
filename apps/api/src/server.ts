import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db/prisma.js";
import { logger } from "./observability/logger.js";

const app = createApp();
const server = app.listen(config.API_PORT, "0.0.0.0", () => {
  logger.info({ port: config.API_PORT }, "api listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}
