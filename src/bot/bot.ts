import { Telegraf, Markup, session, type Context } from "telegraf";
import Redis from "ioredis";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ensureTelegramUser } from "../services/userService.js";
import { createOrder, listActiveOrders } from "../services/orderService.js";
import { createOfferAndTrade, confirmPayment, releaseEscrow, openDispute } from "../services/tradeService.js";
import { ensureWallet } from "../services/walletService.js";
import { initMarketMakers, createUserOrder, listOrders, listUserOrders, findOrder, tradeOrder } from "./marketplace.js";

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

const buildMenuKeyboard = () => {
  const rows = [];
  if (config.webAppUrl) {
    rows.push([Markup.button.webApp("Открыть обменник", config.webAppUrl)]);
  }
  rows.push([Markup.button.callback("Создать ордер", "menu:create_order")]);
  rows.push([Markup.button.callback("Открытые ордера", "menu:list_orders")]);
  rows.push([Markup.button.callback("Кошелек", "menu:wallet")]);
  return Markup.inlineKeyboard(rows);
};

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

  await initMarketMakers();

  bot.start(async (ctx) => {
    const name = ctx.from?.username || ctx.from?.first_name || "P2P60 User";
    await ensureTelegramUser(db, ctx.from?.id ?? 0, name);
    resetSession(ctx);
    await ctx.reply(
      [
        "P2P60 — премиальный P2P обмен.",
        "Команды:",
        "/create BUY BTC 0.1 USD — создать ордер",
        "/list — список ордеров",
        "/my — мои ордера",
        "/trade ORDER_ID [AMOUNT] — совершить сделку",
      ].join("\n"),
      buildMenuKeyboard()
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
        await ctx.reply(`Ордер создан: ${order.id}`, buildMenuKeyboard());
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

  bot.command("list", async (ctx) => {
    const orders = listOrders();
    if (!orders.length) {
      return ctx.reply("Пока нет активных ордеров.");
    }
    const text = orders
      .slice(0, 10)
      .map((o) => {
        const price = o.price ? ` @ ${o.price.toFixed(2)} ${o.currency}` : ` ${o.currency}`;
        const tag = o.isMarketMaker ? "MM" : "USER";
        return `${o.id} | ${o.type} ${o.asset} ${o.amount} ${price} | ${tag}`;
      })
      .join("\n");
    await ctx.reply(text + "\n\nЧтобы торговать: /trade ORDER_ID");
  });

  bot.command("my", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    const orders = listUserOrders(userId);
    if (!orders.length) {
      return ctx.reply("У вас пока нет ордеров.");
    }
    const text = orders
      .map((o) => `${o.id} | ${o.type} ${o.asset} ${o.amount} ${o.currency} | ${o.status}`)
      .join("\n");
    await ctx.reply(text);
  });

  bot.command("create", async (ctx) => {
    const parts = ctx.message.text.split(" ").slice(1);
    if (parts.length < 4) {
      return ctx.reply("Формат: /create BUY BTC 0.1 USD");
    }
    const [typeRaw, assetRaw, amountRaw, currencyRaw] = parts;
    const type = typeRaw.toUpperCase();
    const asset = assetRaw.toUpperCase();
    const currency = currencyRaw.toUpperCase();
    const amount = Number(amountRaw);
    if (!["BUY", "SELL"].includes(type)) return ctx.reply("Тип ордера: BUY или SELL.");
    if (!amount || amount <= 0) return ctx.reply("Сумма должна быть больше 0.");
    const userId = String(ctx.from?.id ?? "");
    const username = ctx.from?.username ?? ctx.from?.first_name ?? "user";
    const order = createUserOrder({ user_id: userId, username, type: type as any, asset, amount, currency });
    await ctx.reply(`Ордер создан: ${order.id}`);
  });

  bot.command("trade", async (ctx) => {
    const parts = ctx.message.text.split(" ").slice(1);
    if (!parts.length) return ctx.reply("Формат: /trade ORDER_ID [AMOUNT]");
    const [orderId, amountRaw] = parts;
    const order = findOrder(orderId);
    if (!order || order.status !== "OPEN") {
      return ctx.reply("Ордер не найден или уже закрыт.");
    }
    const amount = amountRaw ? Number(amountRaw) : undefined;
    if (amountRaw && (!amount || amount <= 0)) return ctx.reply("Некорректная сумма.");
    try {
      const result = await tradeOrder(order, String(ctx.from?.id ?? ""), amount);
      const pct = (config.takerFeePct * 100).toFixed(2);
      const message = [
        `Сделка выполнена: ${result.order.id}`,
        `Сумма: ${result.filledAmount}`,
        `Комиссия (${pct}%): ${result.fee}`,
        `К получению: ${result.netAmount}`,
        result.instant ? "Исполнено мгновенно (MM)." : `Статус: отправлено на биржу (${result.externalRef ?? "симуляция"})`,
      ].join("\n");
      await ctx.reply(message);
    } catch (err: any) {
      await ctx.reply(err?.message ?? "Ошибка исполнения.");
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
