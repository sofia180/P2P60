# P2P60 TS — Telegram P2P Exchange Bot (Node.js + TypeScript)

Полноценный каркас P2P‑обменника с Telegram‑ботом, PostgreSQL и Redis. Включает ордера, escrow, рейтинги, dispute, KYC и интеграции.

> Важно: реальный P2P‑обмен фиата требует соответствия законам, лицензий, KYC/AML и договоров с банками/PSP. Этот проект — технический каркас.

## Стек
- Node.js 20 + TypeScript
- Express API
- PostgreSQL (ledger + транзакции)
- Redis (sessions)
- Telegraf (Telegram Bot)

## Быстрый старт

1. Скопируйте `.env.example` → `.env` и заполните.
2. Поднимите базы:

```bash
docker-compose up -d
```

3. Примените миграции:

```bash
npm run db:migrate
```

4. Запуск:

```bash
npm run dev
```

## Основные функции
- Авторизация + 2FA
- Ордеры (buy/sell)
- Escrow на базе ledger
- Dispute/арбитраж
- Рейтинги/отзывы
- Webhooks
- Интеграции банков (mock)

## Telegram команды
- `/start` — меню
- `/confirm TRADE_ID` — подтверждение оплаты
- `/release TRADE_ID` — освобождение escrow
- `/dispute TRADE_ID` — спор

## Пример API
```
POST /api/orders
Authorization: Bearer <token>
{
  "side": "sell",
  "baseCurrency": "USDT",
  "quoteCurrency": "USD",
  "price": 1.01,
  "amount": 500,
  "minLimit": 50,
  "maxLimit": 200
}
```

## Тесты
```
npm test
```

## Примечания по escrow
Escrow реализован через блокировку `wallet.locked` и учёт в `ledger_entries`. Освобождение выполняет перевод заблокированных средств на кошелёк покупателя.
