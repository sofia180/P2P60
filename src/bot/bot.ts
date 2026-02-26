import { Telegraf, Markup, session, type Context } from "telegraf";
import Redis from "ioredis";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ensureTelegramUser } from "../services/userService.js";
import { createOrder, listActiveOrders } from "../services/orderService.js";
import { createOfferAndTrade, confirmPayment, releaseEscrow, openDispute } from "../services/tradeService.js";
import { ensureWallet } from "../services/walletService.js";

type BotSession = {
  flow?: "create_order" | "create_offer";
  step?: string;
  data?: Record<string, any>;
};

type BotContext = Context & { session: BotSession };

const redis = new Redis(config.redisUrl);

const store = {
  get: async (key: string) => {
    const data = await redis.get(key);
    return data ? (JSON.parse(data) as BotSession) : undefined;
  },
  set: async (key: string, value: BotSession) => {
    await redis.set(key, JSON.stringify(value));
  },
  delete: async (key: string) => {
    await redis.del(key);
  },
};

const menuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Создать ордер", "menu:create_order")],
  [Markup.button.callback("Открытые ордера", "menu:list_orders")],
  [Markup.button.callback("Кошелек", "menu:wallet")],
]);

const sideKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Купить", "order_side:buy"), Markup.button.callback("Продать", "order_side:sell")],
]);

const currencyKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("USDT", "order_base:USDT"), Markup.button.callback("USD", "order_base:USD")],
  [Markup.button.callback("EUR", "order_base:EUR")],
]);

const quoteKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("USD", "order_quote:USD"), Markup.button.callback("EUR", "order_quote:EUR")],
]);

const resetSession = (ctx: any) => {
  ctx.session.flow = undefined;
  ctx.session.step = undefined;
  ctx.session.data = {};
};

export const startBot = async () => {
  const bot = new Telegraf<BotContext>(config.botToken);

  bot.use(session({ store: store as any, defaultSession: (): BotSession => ({ data: {} }) }) as any);

  bot.start(async (ctx) => {
    const name = ctx.from?.username || ctx.from?.first_name || "P2P60 User";
    await ensureTelegramUser(db, ctx.from?.id ?? 0, name);
    resetSession(ctx);
    await ctx.reply(
      "P2P60 — премиальный P2P обмен.\nВыберите действие:",
      menuKeyboard
    );
  });

  bot.action("menu:create_order", async (ctx) => {
    ctx.session.flow = "create_order";
    ctx.session.step = "side";
    await ctx.reply("Выберите сторону:", sideKeyboard);
    await ctx.answerCbQuery();
  });

  bot.action("menu:list_orders", async (ctx) => {
    const orders = await listActiveOrders(db, {});
    if (!orders.length) {
      await ctx.reply("Нет активных ордеров.");
      return ctx.answerCbQuery();
    }
    const buttons = orders.slice(0, 8).map((order: any) => [
      Markup.button.callback(
        `${order.side.toUpperCase()} ${order.base_currency}/${order.quote_currency} @ ${order.price}`,
        `offer:${order.id}`
      ),
    ]);
    await ctx.reply("Выберите ордер:", Markup.inlineKeyboard(buttons));
    await ctx.answerCbQuery();
  });

  bot.action("menu:wallet", async (ctx) => {
    const user = await ensureTelegramUser(db, ctx.from?.id ?? 0, ctx.from?.username ?? "user");
    const wallets = await db.query("SELECT currency, balance, locked FROM wallets WHERE user_id=$1", [user.id]);
    if (!wallets.rows.length) {
      await ctx.reply("У вас пока нет кошельков.");
      return ctx.answerCbQuery();
    }
    const text = wallets.rows
      .map((w: any) => `${w.currency}: ${Number(w.balance).toFixed(2)} (locked ${Number(w.locked).toFixed(2)})`)
      .join("\n");
    await ctx.reply(text);
    await ctx.answerCbQuery();
  });

  bot.action(/order_side:(buy|sell)/, async (ctx) => {
    if (ctx.session.flow !== "create_order") return ctx.answerCbQuery();
    ctx.session.data = { ...ctx.session.data, side: ctx.match[1] };
    ctx.session.step = "base";
    await ctx.reply("Выберите базовую валюту:", currencyKeyboard);
    await ctx.answerCbQuery();
  });

  bot.action(/order_base:(\w+)/, async (ctx) => {
    if (ctx.session.flow !== "create_order") return ctx.answerCbQuery();
    ctx.session.data = { ...ctx.session.data, baseCurrency: ctx.match[1] };
    ctx.session.step = "quote";
    await ctx.reply("Выберите валюту расчета:", quoteKeyboard);
    await ctx.answerCbQuery();
  });

  bot.action(/order_quote:(\w+)/, async (ctx) => {
    if (ctx.session.flow !== "create_order") return ctx.answerCbQuery();
    ctx.session.data = { ...ctx.session.data, quoteCurrency: ctx.match[1] };
    ctx.session.step = "price";
    await ctx.reply("Введите цену (например 1.01):");
    await ctx.answerCbQuery();
  });

  bot.action(/offer:(.+)/, async (ctx) => {
    ctx.session.flow = "create_offer";
    ctx.session.step = "amount";
    ctx.session.data = { orderId: ctx.match[1] };
    await ctx.reply("Введите сумму сделки:");
    await ctx.answerCbQuery();
  });

  bot.on("text", async (ctx) => {
    const text = ctx.message.text;
    if (ctx.session.flow === "create_order") {
      if (ctx.session.step === "price") {
        ctx.session.data = { ...ctx.session.data, price: Number(text) };
        ctx.session.step = "amount";
        await ctx.reply("Введите общий объем:");
        return;
      }
      if (ctx.session.step === "amount") {
        ctx.session.data = { ...ctx.session.data, amount: Number(text) };
        ctx.session.step = "min";
        await ctx.reply("Минимальный лимит сделки:");
        return;
      }
      if (ctx.session.step === "min") {
        ctx.session.data = { ...ctx.session.data, minLimit: Number(text) };
        ctx.session.step = "max";
        await ctx.reply("Максимальный лимит сделки:");
        return;
      }
      if (ctx.session.step === "max") {
        ctx.session.data = { ...ctx.session.data, maxLimit: Number(text) };
        const user = await ensureTelegramUser(db, ctx.from?.id ?? 0, ctx.from?.username ?? "user");
        const order = await createOrder(db, {
          userId: user.id,
          side: ctx.session.data.side,
          baseCurrency: ctx.session.data.baseCurrency,
          quoteCurrency: ctx.session.data.quoteCurrency,
          price: ctx.session.data.price,
          amount: ctx.session.data.amount,
          minLimit: ctx.session.data.minLimit,
          maxLimit: ctx.session.data.maxLimit,
        });
        resetSession(ctx);
        await ctx.reply(`Ордер создан: ${order.id}`, menuKeyboard);
        return;
      }
    }

    if (ctx.session.flow === "create_offer" && ctx.session.step === "amount") {
      const amount = Number(text);
      const user = await ensureTelegramUser(db, ctx.from?.id ?? 0, ctx.from?.username ?? "user");
      const result = await createOfferAndTrade(db, { orderId: ctx.session.data?.orderId, userId: user.id, amount });
      resetSession(ctx);
      await ctx.reply(`Сделка создана: ${result.trade.id}. Ожидаем подтверждение оплаты.`);
      return;
    }
  });

  bot.command("confirm", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const tradeId = parts[1];
    if (!tradeId) return ctx.reply("Используйте /confirm TRADE_ID");
    const user = await ensureTelegramUser(db, ctx.from?.id ?? 0, ctx.from?.username ?? "user");
    await confirmPayment(db, tradeId, user.id);
    await ctx.reply("Оплата подтверждена. Ожидаем продавца.");
  });

  bot.command("release", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const tradeId = parts[1];
    if (!tradeId) return ctx.reply("Используйте /release TRADE_ID");
    const user = await ensureTelegramUser(db, ctx.from?.id ?? 0, ctx.from?.username ?? "user");
    await releaseEscrow(db, tradeId, user.id);
    await ctx.reply("Escrow освобожден. Сделка завершена.");
  });

  bot.command("dispute", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const tradeId = parts[1];
    if (!tradeId) return ctx.reply("Используйте /dispute TRADE_ID");
    const user = await ensureTelegramUser(db, ctx.from?.id ?? 0, ctx.from?.username ?? "user");
    await openDispute(db, tradeId, user.id, "Opened via Telegram");
    await ctx.reply("Спор открыт. Арбитраж рассмотрит." );
  });

  await bot.launch();
  console.log("Telegram bot started");
};
