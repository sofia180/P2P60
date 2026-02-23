import os
from dotenv import load_dotenv

ENV_FILE = os.getenv("ENV_FILE", ".env")
load_dotenv(ENV_FILE, override=True)


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is required")

ADMIN_IDS = {int(x) for x in _split_csv(os.getenv("ADMIN_IDS", "")) if x.isdigit()}

BRAND_NAME = os.getenv("BRAND_NAME", "P2P60")
BRAND_TAGLINE = os.getenv("BRAND_TAGLINE", "Fast P2P Exchange")
SUPPORT_HANDLE = os.getenv("SUPPORT_HANDLE", "@p2p60_support")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

CURRENCIES = _split_csv(os.getenv("CURRENCIES", "RUB,USD,EUR,USDT"))
PAYMENT_METHODS = _split_csv(os.getenv("PAYMENT_METHODS", "Банк,Наличные,Крипто-кошелек"))
CITY_OPTIONS = _split_csv(os.getenv("CITY_OPTIONS", ""))

HIGH_AMOUNT = float(os.getenv("HIGH_AMOUNT", "5000"))

DIRECTION_OPTIONS = [
    {"key": "exchange", "label": "Обмен"},
    {"key": "buy", "label": "Покупаю"},
    {"key": "sell", "label": "Продаю"},
    {"key": "transfer", "label": "Перевод"},
]

URGENCY_OPTIONS = [
    {"key": "now", "label": "Сейчас"},
    {"key": "today", "label": "Сегодня"},
    {"key": "days", "label": "1–3 дня"},
]

INTRO_TEXT = os.getenv(
    "INTRO_TEXT",
    (
        f"<b>{BRAND_NAME}</b> — премиальный P2P-обмен за 60 секунд.\n"
        "Чистые условия, быстрые подтверждения, безопасность на уровне финтеха.\n\n"
        "<b>Процесс</b>\n"
        "• Вы задаете направление, сумму и способ\n"
        "• Мы фиксируем курс и условия\n"
        "• Перевод и закрытие сделки\n\n"
        "<b>Сервис</b>\n"
        "⏱ Среднее согласование: 6 минут\n"
        "🛡 Проверка контрагента и условий\n"
        "💬 Поддержка 24/7"
    ),
)

QUESTION_DIRECTION = os.getenv("QUESTION_DIRECTION", "Какую операцию хотите выполнить?")
QUESTION_FROM_CURRENCY = os.getenv("QUESTION_FROM_CURRENCY", "Что отдаете?")
QUESTION_TO_CURRENCY = os.getenv("QUESTION_TO_CURRENCY", "Что получаете?")
QUESTION_AMOUNT = os.getenv(
    "QUESTION_AMOUNT",
    "Укажите сумму. Например: 1500 или 1500 USD.",
)
QUESTION_PAYMENT = os.getenv("QUESTION_PAYMENT", "Какой способ оплаты/получения удобен?")
QUESTION_CITY = os.getenv("QUESTION_CITY", "В каком городе/стране вы находитесь?")
QUESTION_URGENCY = os.getenv("QUESTION_URGENCY", "Насколько срочно?")
QUESTION_CONTACT = os.getenv("QUESTION_CONTACT", "Поделитесь номером телефона для подтверждения.")

THANK_YOU_MESSAGE = os.getenv(
    "THANK_YOU_MESSAGE",
    "Заявка принята. Мы закрепили условия и скоро свяжемся с вами.",
)
DUPLICATE_MESSAGE = os.getenv(
    "DUPLICATE_MESSAGE",
    "Мы уже получили вашу заявку и скоро выйдем на связь.",
)

HOW_IT_WORKS_MESSAGE = os.getenv(
    "HOW_IT_WORKS_MESSAGE",
    (
        "<b>Как это работает</b>\n"
        "1. Вы задаете направление и сумму.\n"
        "2. Оператор фиксирует курс и подтверждает детали.\n"
        "3. Совершаем перевод и закрываем сделку.\n\n"
        "Мы работаем только в рамках закона и можем запросить данные для AML/KYC."
    ),
)

RATE_INFO_MESSAGE = os.getenv(
    "RATE_INFO_MESSAGE",
    (
        "<b>Курс сейчас</b>\n"
        "Курс рассчитывается индивидуально под объем и способ. "
        "Нажмите «Начать обмен», чтобы зафиксировать условия."
    ),
)

SUPPORT_MESSAGE = os.getenv(
    "SUPPORT_MESSAGE",
    f"Напишите в поддержку: {SUPPORT_HANDLE}",
)

PHONE_MIN_DIGITS = int(os.getenv("PHONE_MIN_DIGITS", "10"))

CRM_WEBHOOK_URL = os.getenv("CRM_WEBHOOK_URL", "")
GOOGLE_SHEETS_WEBHOOK_URL = os.getenv("GOOGLE_SHEETS_WEBHOOK_URL", "")
GOOGLE_SHEETS_CSV_PATH = os.getenv("GOOGLE_SHEETS_CSV_PATH", "")
WEBHOOK_TIMEOUT_SECONDS = int(os.getenv("WEBHOOK_TIMEOUT_SECONDS", "10"))
