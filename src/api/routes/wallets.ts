import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { wrapAsync } from "../../utils/errors.js";
import { ensureWallet, adjustBalance } from "../../services/walletService.js";
import { createDeposit, createWithdrawal } from "../../services/bankService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  wrapAsync(async (req, res) => {
    const wallets = await db.query("SELECT * FROM wallets WHERE user_id=$1", [req.user.userId]);
    res.json(wallets.rows);
  })
);

const transferSchema = z.object({ amount: z.number(), currency: z.string(), accountId: z.string() });

router.post(
  "/deposit",
  requireAuth,
  wrapAsync(async (req, res) => {
    const payload = transferSchema.parse(req.body);
    const transfer = await createDeposit(db, req.user.userId, payload.amount, payload.currency, payload.accountId);
    const wallet = await ensureWallet(db, req.user.userId, payload.currency);
    await adjustBalance(db, wallet.id, payload.amount, "DEPOSIT", "credit", "bank_transfer", transfer.id);
    res.json({ transfer, wallet });
  })
);

router.post(
  "/withdraw",
  requireAuth,
  wrapAsync(async (req, res) => {
    const payload = transferSchema.parse(req.body);
    const transfer = await createWithdrawal(db, req.user.userId, payload.amount, payload.currency, payload.accountId);
    const wallet = await ensureWallet(db, req.user.userId, payload.currency);
    await adjustBalance(db, wallet.id, payload.amount, "WITHDRAW", "debit", "bank_transfer", transfer.id);
    res.json({ transfer, wallet });
  })
);

export default router;
