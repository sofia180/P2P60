import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { wrapAsync } from "../../utils/errors.js";
import { confirmPayment, releaseEscrow, openDispute } from "../../services/tradeService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post(
  "/:id/confirm",
  requireAuth,
  wrapAsync(async (req, res) => {
    const result = await confirmPayment(db, req.params.id, req.user.userId);
    res.json(result);
  })
);

router.post(
  "/:id/release",
  requireAuth,
  wrapAsync(async (req, res) => {
    const result = await releaseEscrow(db, req.params.id, req.user.userId);
    res.json(result);
  })
);

router.post(
  "/:id/dispute",
  requireAuth,
  wrapAsync(async (req, res) => {
    const payload = z.object({ reason: z.string().optional() }).parse(req.body);
    const result = await openDispute(db, req.params.id, req.user.userId, payload.reason);
    res.json(result);
  })
);

router.post(
  "/:id/rate",
  requireAuth,
  wrapAsync(async (req, res) => {
    const payload = z.object({ score: z.number().min(1).max(5), comment: z.string().optional() }).parse(req.body);
    const trade = (await db.query("SELECT * FROM trades WHERE id=$1", [req.params.id])).rows[0];
    if (!trade) return res.status(404).json({ error: "Trade not found" });
    if (trade.status !== "released") return res.status(400).json({ error: "Trade not completed" });
    const toUser = trade.buyer_id === req.user.userId ? trade.seller_id : trade.buyer_id;
    await db.query(
      "INSERT INTO ratings (trade_id, from_user, to_user, score, comment) VALUES ($1,$2,$3,$4,$5)",
      [trade.id, req.user.userId, toUser, payload.score, payload.comment ?? null]
    );
    await db.query(
      "UPDATE profiles SET rating_avg = (rating_avg * rating_count + $1) / (rating_count + 1), rating_count = rating_count + 1 WHERE user_id=$2",
      [payload.score, toUser]
    );
    res.json({ ok: true });
  })
);

export default router;
