import express from "express";
import path from "node:path";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { HttpError } from "../utils/errors.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import orderRoutes from "./routes/orders.js";
import tradeRoutes from "./routes/trades.js";
import walletRoutes from "./routes/wallets.js";
import webhookRoutes from "./routes/webhooks.js";
import ratesRoutes from "./routes/rates.js";

export const createApp = () => {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  const publicDir = path.join(process.cwd(), "public", "webapp");
  app.use(express.static(publicDir));
  app.use("/app", express.static(publicDir));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/trades", tradeRoutes);
  app.use("/api/wallets", walletRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/rates", ratesRoutes);

  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
};

export const startApi = () => {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`API listening on ${config.port}`);
  });
};
