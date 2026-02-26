import express from "express";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { HttpError } from "../utils/errors.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import orderRoutes from "./routes/orders.js";
import tradeRoutes from "./routes/trades.js";
import walletRoutes from "./routes/wallets.js";
import webhookRoutes from "./routes/webhooks.js";

export const createApp = () => {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  app.get("/", (_req, res) => {
    res
      .type("html")
      .send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>P2P60 — Exchange</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0a0d12;
        --card: #0f1420;
        --text: #e9eef5;
        --muted: #98a3b3;
        --accent: #62f7ff;
        --accent-2: #7a5cff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(800px 300px at 20% -10%, rgba(98,247,255,0.15), transparent 60%),
          radial-gradient(800px 300px at 110% 20%, rgba(122,92,255,0.18), transparent 60%),
          var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
      .wrap {
        width: min(720px, 92vw);
        padding: 28px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 0 0 1px rgba(98,247,255,0.15), 0 24px 60px rgba(0,0,0,0.45);
      }
      h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0.3px; }
      p { margin: 0 0 18px; color: var(--muted); }
      .row { display: flex; gap: 12px; flex-wrap: wrap; }
      .btn {
        padding: 12px 16px;
        border-radius: 12px;
        border: 1px solid rgba(98,247,255,0.35);
        color: var(--text);
        text-decoration: none;
        background: linear-gradient(180deg, rgba(98,247,255,0.12), rgba(98,247,255,0.04));
        transition: transform .15s ease, box-shadow .2s ease;
      }
      .btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(98,247,255,0.18); }
      .card {
        margin-top: 18px;
        padding: 14px;
        border-radius: 12px;
        background: var(--card);
        border: 1px solid rgba(255,255,255,0.06);
        color: var(--muted);
        font-size: 14px;
      }
      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        color: #0b1017;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
        margin-right: 8px;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <span class="badge">Online</span>
      <h1>P2P60 — приватный обменник</h1>
      <p>API поднят. Для Telegram WebApp нужен отдельный фронтенд (добавим).</p>
      <div class="row">
        <a class="btn" href="/health">Проверка /health</a>
        <a class="btn" href="https://t.me/p2p60bot">Открыть бота</a>
      </div>
      <div class="card">
        Если вы видите эту страницу — сервер работает. Далее подключим WebApp UI и кнопку «Открыть обменник» в Telegram.
      </div>
    </div>
  </body>
</html>`);
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/trades", tradeRoutes);
  app.use("/api/wallets", walletRoutes);
  app.use("/api/webhooks", webhookRoutes);

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
