import { describe, expect, it } from "vitest";
import { createTestDb } from "../testDb.js";
import { createUser } from "../../src/services/userService.js";
import { ensureWallet, adjustBalance } from "../../src/services/walletService.js";
import { createOrder } from "../../src/services/orderService.js";
import { createOfferAndTrade } from "../../src/services/tradeService.js";

describe("trade flow", () => {
  it("locks escrow on trade creation", async () => {
    const db = await createTestDb();
    const sellerId = await createUser(db, { email: "seller@test.com", password: "pass123" });
    const buyerId = await createUser(db, { email: "buyer@test.com", password: "pass123" });

    const sellerWallet = await ensureWallet(db, sellerId, "USDT");
    await adjustBalance(db, sellerWallet.id, 1000, "DEPOSIT", "credit");

    const order = await createOrder(db, {
      userId: sellerId,
      side: "sell",
      baseCurrency: "USDT",
      quoteCurrency: "USD",
      price: 1,
      amount: 500,
      minLimit: 50,
      maxLimit: 500,
    });

    const result = await createOfferAndTrade(db, { orderId: order.id, userId: buyerId, amount: 100 });

    const walletRow = await db.query("SELECT balance, locked FROM wallets WHERE id=$1", [sellerWallet.id]);
    expect(Number(walletRow.rows[0].locked)).toBe(100);
    expect(result.trade.status).toBe("locked");
  });
});
