import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { wrapAsync } from "../../utils/errors.js";
import { createOrder, listActiveOrders, closeOrder } from "../../services/orderService.js";
import { createOfferAndTrade } from "../../services/tradeService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const orderSchema = z.object({
  side: z.enum(["buy", "sell"]),
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  price: z.number(),
  amount: z.number(),
  minLimit: z.number(),
  maxLimit: z.number(),
  paymentMethod: z.string().optional(),
});

router.post(
  "/",
  requireAuth,
  wrapAsync(async (req, res) => {
    const payload = orderSchema.parse(req.body);
    const order = await createOrder(db, { userId: req.user.userId, ...payload });
    res.json(order);
  })
);

router.get(
  "/",
  wrapAsync(async (req, res) => {
    const orders = await listActiveOrders(db, {
      side: req.query.side as string | undefined,
      baseCurrency: req.query.baseCurrency as string | undefined,
      quoteCurrency: req.query.quoteCurrency as string | undefined,
    });
    res.json(orders);
  })
);

router.patch(
  "/:id",
  requireAuth,
  wrapAsync(async (req, res) => {
    const order = await closeOrder(db, req.params.id, req.user.userId);
    res.json(order);
  })
);

const offerSchema = z.object({ amount: z.number() });

router.post(
  "/:id/offers",
  requireAuth,
  wrapAsync(async (req, res) => {
    const payload = offerSchema.parse(req.body);
    const result = await createOfferAndTrade(db, { orderId: req.params.id, userId: req.user.userId, amount: payload.amount });
    res.json(result);
  })
);

export default router;
