import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { wrapAsync } from "../../utils/errors.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const schema = z.object({ url: z.string().url(), events: z.array(z.string()) });

router.post(
  "/",
  requireAuth,
  wrapAsync(async (req, res) => {
    const payload = schema.parse(req.body);
    const result = await db.query(
      "INSERT INTO webhook_subscriptions (user_id, url, events) VALUES ($1,$2,$3) RETURNING *",
      [req.user.userId, payload.url, payload.events]
    );
    res.json(result.rows[0]);
  })
);

router.post(
  "/test",
  requireAuth,
  wrapAsync(async (_req, res) => {
    res.json({ ok: true, message: "Webhook test endpoint" });
  })
);

export default router;
