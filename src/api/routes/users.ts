import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { wrapAsync } from "../../utils/errors.js";
import { submitKyc } from "../../services/kycService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get(
  "/me",
  requireAuth,
  wrapAsync(async (req, res) => {
    const userId = req.user.userId;
    const user = (await db.query("SELECT id, email, phone, status, kyc_status, kyc_level FROM users WHERE id=$1", [userId])).rows[0];
    res.json(user);
  })
);

const kycSchema = z.object({ payload: z.record(z.any()) });

router.post(
  "/kyc",
  requireAuth,
  wrapAsync(async (req, res) => {
    const userId = req.user.userId;
    const { payload } = kycSchema.parse(req.body);
    const result = await submitKyc(db, userId, payload);
    res.json(result);
  })
);

export default router;
