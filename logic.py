from __future__ import annotations

from typing import Any

from config import HIGH_AMOUNT


PRIORITY_LABELS = {
    "high": "Высокий",
    "normal": "Стандартный",
}


def classify_priority(urgency_key: str | None, amount_value: float | None) -> str:
    if urgency_key in {"now", "today"}:
        return "high"
    if amount_value is not None and amount_value >= HIGH_AMOUNT:
        return "high"
    return "normal"


def priority_label(priority: str) -> str:
    return PRIORITY_LABELS.get(priority, priority)


def format_request_message(request: dict[str, Any]) -> str:
    return (
        "⚡️ Новая заявка P2P\n"
        f"Приоритет: {priority_label(request.get('priority'))}\n"
        f"Направление: {request.get('direction_label') or '-'}\n"
        f"Отдаете: {request.get('from_currency') or '-'}\n"
        f"Получаете: {request.get('to_currency') or '-'}\n"
        f"Сумма: {request.get('amount_text') or '-'}\n"
        f"Способ: {request.get('payment_method') or '-'}\n"
        f"Локация: {request.get('city') or '-'}\n"
        f"Срочность: {request.get('urgency_label') or '-'}\n"
        f"Контакт: {request.get('phone') or '-'}\n"
        f"Telegram: {request.get('tg_username') or request.get('tg_user_id') or '-'}"
    )
