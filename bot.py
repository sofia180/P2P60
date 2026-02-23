import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    CallbackQuery,
    Message,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo,
    FSInputFile,
)
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app_logging import setup_logging
from config import (
    ADMIN_IDS,
    BOT_TOKEN,
    BRAND_NAME,
    INTRO_TEXT,
    QUESTION_DIRECTION,
    QUESTION_FROM_CURRENCY,
    QUESTION_TO_CURRENCY,
    QUESTION_AMOUNT,
    QUESTION_PAYMENT,
    QUESTION_CITY,
    QUESTION_URGENCY,
    QUESTION_CONTACT,
    THANK_YOU_MESSAGE,
    DUPLICATE_MESSAGE,
    RATE_INFO_MESSAGE,
    HOW_IT_WORKS_MESSAGE,
    SUPPORT_MESSAGE,
    PHONE_MIN_DIGITS,
    DIRECTION_OPTIONS,
    URGENCY_OPTIONS,
    CURRENCIES,
    PAYMENT_METHODS,
    CITY_OPTIONS,
    EXCHANGE_OPTIONS,
    WALLET_NETWORKS,
    WEBAPP_URL,
)
from logic import classify_priority, format_request_message
from market import get_rates_text
from states import ExchangeForm, ConnectForm
from storage import (
    init_db,
    save_request,
    stats as request_stats,
    export_requests_csv,
    push_to_integrations,
    save_connection,
    list_connections,
)

router = Router()


def is_admin(user_id: int | None) -> bool:
    return bool(user_id) and user_id in ADMIN_IDS


def normalize_phone(text: str) -> str | None:
    if not text:
        return None
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) < PHONE_MIN_DIGITS:
        return None
    return digits


def parse_amount(text: str) -> tuple[float | None, str | None]:
    if not text:
        return None, None
    match = re.search(r"(\d+(?:[\.,]\d+)?)", text.replace(" ", ""))
    if not match:
        return None, None
    raw = match.group(1)
    try:
        value = float(raw.replace(",", "."))
    except ValueError:
        return None, None
    return value, text.strip()


def option_label(options: list[dict], key: str | None) -> str | None:
    if not key:
        return None
    for option in options:
        if option.get("key") == key:
            return option.get("label")
    return key


def build_start_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    if WEBAPP_URL:
        builder.button(text="Открыть красивую форму", web_app=WebAppInfo(url=WEBAPP_URL))
    builder.button(text="Начать обмен", callback_data="start_exchange")
    builder.button(text="Курс сейчас", callback_data="rate_info")
    builder.button(text="Подключить биржу/кошелек", callback_data="connect_start")
    builder.button(text="Мои подключения", callback_data="my_connections")
    builder.button(text="Как это работает", callback_data="how_it_works")
    builder.button(text="Поддержка", callback_data="support")
    builder.adjust(1)
    return builder.as_markup()


def build_direction_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for option in DIRECTION_OPTIONS:
        builder.button(text=option["label"], callback_data=f"direction:{option['key']}")
    builder.adjust(2)
    return builder.as_markup()


def build_currency_keyboard(prefix: str) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for currency in CURRENCIES:
        builder.button(text=currency, callback_data=f"{prefix}:{currency}")
    builder.adjust(2)
    return builder.as_markup()


def build_payment_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for method in PAYMENT_METHODS:
        builder.button(text=method, callback_data=f"payment:{method}")
    builder.adjust(1)
    return builder.as_markup()


def build_city_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for city in CITY_OPTIONS:
        builder.button(text=city, callback_data=f"city:{city}")
    builder.adjust(2)
    return builder.as_markup()


def build_urgency_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for option in URGENCY_OPTIONS:
        builder.button(text=option["label"], callback_data=f"urgency:{option['key']}")
    builder.adjust(3)
    return builder.as_markup()


def build_confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Отправить заявку", callback_data="confirm_request"),
                InlineKeyboardButton(text="Изменить", callback_data="edit_request"),
            ]
        ]
    )


def build_contact_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Поделиться контактом", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def build_connect_kind_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Биржу", callback_data="connect_kind:exchange"),
                InlineKeyboardButton(text="Кошелек", callback_data="connect_kind:wallet"),
            ]
        ]
    )


def build_exchange_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for name in EXCHANGE_OPTIONS:
        builder.button(text=name, callback_data=f"exchange:{name}")
    builder.button(text="Другая", callback_data="exchange:other")
    builder.adjust(2)
    return builder.as_markup()


def build_wallet_network_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for network in WALLET_NETWORKS:
        builder.button(text=network, callback_data=f"network:{network}")
    builder.button(text="Другая", callback_data="network:other")
    builder.adjust(2)
    return builder.as_markup()


def build_connect_confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Сохранить", callback_data="connect_confirm"),
                InlineKeyboardButton(text="Отменить", callback_data="connect_cancel"),
            ]
        ]
    )


def mask_identifier(value: str | None) -> str:
    if not value:
        return "-"
    clean = value.strip()
    if len(clean) <= 8:
        return clean
    return f"{clean[:4]}…{clean[-4:]}"


async def ask_direction(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.direction)
    await message.answer(QUESTION_DIRECTION, reply_markup=build_direction_keyboard())


async def ask_from_currency(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.from_currency)
    await message.answer(QUESTION_FROM_CURRENCY, reply_markup=build_currency_keyboard("from"))


async def ask_to_currency(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.to_currency)
    await message.answer(QUESTION_TO_CURRENCY, reply_markup=build_currency_keyboard("to"))


async def ask_amount(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.amount)
    await message.answer(QUESTION_AMOUNT)


async def ask_payment(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.payment)
    await message.answer(QUESTION_PAYMENT, reply_markup=build_payment_keyboard())


async def ask_city(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.city)
    if CITY_OPTIONS:
        await message.answer(QUESTION_CITY, reply_markup=build_city_keyboard())
        return
    await message.answer(QUESTION_CITY)


async def ask_urgency(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.urgency)
    await message.answer(QUESTION_URGENCY, reply_markup=build_urgency_keyboard())


async def ask_contact(message: Message, state: FSMContext) -> None:
    await state.set_state(ExchangeForm.contact)
    await message.answer(QUESTION_CONTACT, reply_markup=build_contact_keyboard())


async def ask_connect_kind(message: Message, state: FSMContext) -> None:
    await state.set_state(ConnectForm.kind)
    await message.answer(
        "Что хотите подключить?\n"
        "Мы запрашиваем только публичные данные (UID/адрес), без API-ключей.",
        reply_markup=build_connect_kind_keyboard(),
    )


async def ask_exchange(message: Message, state: FSMContext) -> None:
    await state.set_state(ConnectForm.exchange)
    await message.answer("Выберите биржу.", reply_markup=build_exchange_keyboard())


async def ask_wallet_network(message: Message, state: FSMContext) -> None:
    await state.set_state(ConnectForm.wallet_network)
    await message.answer("Выберите сеть/тип кошелька.", reply_markup=build_wallet_network_keyboard())


async def ask_identifier(message: Message, state: FSMContext, prompt: str) -> None:
    await state.set_state(ConnectForm.identifier)
    await message.answer(prompt)


async def show_connect_summary(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    summary = (
        "<b>Проверьте подключение</b>\n"
        f"Тип: {'Биржа' if data.get('kind') == 'exchange' else 'Кошелек'}\n"
        f"Биржа: {data.get('exchange_name') or '-'}\n"
        f"Сеть: {data.get('network') or '-'}\n"
        f"Идентификатор: {mask_identifier(data.get('identifier'))}"
    )
    await state.set_state(ConnectForm.confirm)
    await message.answer(summary, reply_markup=build_connect_confirm_keyboard())


async def show_summary(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    summary = (
        "<b>Проверьте заявку</b>\n"
        f"Направление: {data.get('direction_label') or '-'}\n"
        f"Отдаете: {data.get('from_currency') or '-'}\n"
        f"Получаете: {data.get('to_currency') or '-'}\n"
        f"Сумма: {data.get('amount_text') or '-'}\n"
        f"Способ: {data.get('payment_method') or '-'}\n"
        f"Локация: {data.get('city') or '-'}\n"
        f"Срочность: {data.get('urgency_label') or '-'}\n"
        f"Контакт: {data.get('phone') or '-'}"
    )
    await state.set_state(ExchangeForm.confirm)
    await message.answer(summary, reply_markup=build_confirm_keyboard())


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext) -> None:
    await state.clear()
    rates_text = await get_rates_text()
    await message.answer(f"{INTRO_TEXT}\n\n{rates_text}", reply_markup=build_start_keyboard())


@router.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("Ок, отменил. Чтобы начать заново, отправьте /start.")


@router.callback_query(F.data == "start_exchange")
async def start_exchange(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await ask_direction(callback.message, state)


@router.callback_query(F.data == "rate_info")
async def show_rate(callback: CallbackQuery) -> None:
    await callback.answer()
    rates_text = await get_rates_text()
    await callback.message.answer(f"{rates_text}\n\n{RATE_INFO_MESSAGE}")


@router.callback_query(F.data == "how_it_works")
async def show_how_it_works(callback: CallbackQuery) -> None:
    await callback.answer()
    await callback.message.answer(HOW_IT_WORKS_MESSAGE)


@router.callback_query(F.data == "support")
async def show_support(callback: CallbackQuery) -> None:
    await callback.answer()
    await callback.message.answer(SUPPORT_MESSAGE)


@router.callback_query(F.data == "connect_start")
async def connect_start(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await ask_connect_kind(callback.message, state)


@router.callback_query(F.data == "my_connections")
async def show_connections(callback: CallbackQuery) -> None:
    await callback.answer()
    user_id = str(callback.from_user.id) if callback.from_user else ""
    rows = list_connections(user_id)
    if not rows:
        await callback.message.answer("Подключений пока нет.")
        return

    lines = ["<b>Ваши подключения</b>"]
    for row in rows:
        kind = "Биржа" if row["kind"] == "exchange" else "Кошелек"
        exchange = row["exchange_name"] or "-"
        network = row["network"] or "-"
        identifier = mask_identifier(row["identifier"])
        lines.append(f"{kind}: {exchange} • {network} • {identifier}")
    await callback.message.answer("\n".join(lines))


@router.message(Command("connections"))
async def cmd_connections(message: Message) -> None:
    user_id = str(message.from_user.id) if message.from_user else ""
    rows = list_connections(user_id)
    if not rows:
        await message.answer("Подключений пока нет.")
        return
    lines = ["<b>Ваши подключения</b>"]
    for row in rows:
        kind = "Биржа" if row["kind"] == "exchange" else "Кошелек"
        exchange = row["exchange_name"] or "-"
        network = row["network"] or "-"
        identifier = mask_identifier(row["identifier"])
        lines.append(f"{kind}: {exchange} • {network} • {identifier}")
    await message.answer("\n".join(lines))


@router.callback_query(ConnectForm.kind, F.data.startswith("connect_kind:"))
async def connect_kind_selected(callback: CallbackQuery, state: FSMContext) -> None:
    kind = callback.data.split(":", 1)[1]
    await state.update_data(kind=kind)
    await callback.answer()
    if kind == "exchange":
        await ask_exchange(callback.message, state)
    else:
        await ask_wallet_network(callback.message, state)


@router.callback_query(ConnectForm.exchange, F.data.startswith("exchange:"))
async def connect_exchange_selected(callback: CallbackQuery, state: FSMContext) -> None:
    exchange = callback.data.split(":", 1)[1]
    await callback.answer()
    if exchange == "other":
        await state.set_state(ConnectForm.exchange_custom)
        await callback.message.answer("Введите название биржи.")
        return
    await state.update_data(exchange_name=exchange)
    await ask_identifier(callback.message, state, "Укажите UID/Email/логин в бирже.")


@router.message(ConnectForm.exchange_custom)
async def connect_exchange_custom(message: Message, state: FSMContext) -> None:
    name = (message.text or "").strip()
    if not name:
        await message.answer("Пожалуйста, напишите название биржи.")
        return
    await state.update_data(exchange_name=name)
    await ask_identifier(message, state, "Укажите UID/Email/логин в бирже.")


@router.callback_query(ConnectForm.wallet_network, F.data.startswith("network:"))
async def connect_network_selected(callback: CallbackQuery, state: FSMContext) -> None:
    network = callback.data.split(":", 1)[1]
    await callback.answer()
    if network == "other":
        await state.set_state(ConnectForm.wallet_network_custom)
        await callback.message.answer("Введите сеть/тип кошелька.")
        return
    await state.update_data(network=network)
    await ask_identifier(callback.message, state, "Укажите адрес кошелька.")


@router.message(ConnectForm.wallet_network_custom)
async def connect_network_custom(message: Message, state: FSMContext) -> None:
    network = (message.text or "").strip()
    if not network:
        await message.answer("Пожалуйста, укажите сеть/тип кошелька.")
        return
    await state.update_data(network=network)
    await ask_identifier(message, state, "Укажите адрес кошелька.")


@router.message(ConnectForm.identifier)
async def connect_identifier(message: Message, state: FSMContext) -> None:
    identifier = (message.text or "").strip()
    if len(identifier) < 6:
        await message.answer("Слишком короткий идентификатор. Проверьте и отправьте снова.")
        return
    await state.update_data(identifier=identifier)
    await show_connect_summary(message, state)


@router.callback_query(ConnectForm.confirm, F.data == "connect_cancel")
async def connect_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.clear()
    await callback.message.answer("Подключение отменено. Можете начать заново через /start.")


@router.callback_query(ConnectForm.confirm, F.data == "connect_confirm")
async def connect_confirm(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    data = await state.get_data()
    connection = {
        "tg_user_id": str(callback.from_user.id) if callback.from_user else None,
        "tg_username": f"@{callback.from_user.username}" if callback.from_user and callback.from_user.username else None,
        "kind": data.get("kind"),
        "exchange_name": data.get("exchange_name"),
        "network": data.get("network"),
        "identifier": data.get("identifier"),
    }
    save_connection(connection)
    await state.clear()
    await callback.message.answer("Подключение сохранено. Можно продолжить обмен.")


@router.callback_query(ExchangeForm.direction, F.data.startswith("direction:"))
async def set_direction(callback: CallbackQuery, state: FSMContext) -> None:
    direction_key = callback.data.split(":", 1)[1]
    direction_label = option_label(DIRECTION_OPTIONS, direction_key)
    await state.update_data(direction_key=direction_key, direction_label=direction_label)
    await callback.answer()
    await ask_from_currency(callback.message, state)


@router.callback_query(ExchangeForm.from_currency, F.data.startswith("from:"))
async def set_from_currency(callback: CallbackQuery, state: FSMContext) -> None:
    currency = callback.data.split(":", 1)[1]
    await state.update_data(from_currency=currency)
    await callback.answer()
    await ask_to_currency(callback.message, state)


@router.callback_query(ExchangeForm.to_currency, F.data.startswith("to:"))
async def set_to_currency(callback: CallbackQuery, state: FSMContext) -> None:
    currency = callback.data.split(":", 1)[1]
    await state.update_data(to_currency=currency)
    await callback.answer()
    await ask_amount(callback.message, state)


@router.message(ExchangeForm.amount)
async def set_amount(message: Message, state: FSMContext) -> None:
    amount_value, amount_text = parse_amount(message.text or "")
    if amount_value is None:
        await message.answer("Не вижу сумму. Пример: 1500 или 1500 USD.")
        return
    await state.update_data(amount_value=amount_value, amount_text=amount_text)
    await ask_payment(message, state)


@router.callback_query(ExchangeForm.payment, F.data.startswith("payment:"))
async def set_payment(callback: CallbackQuery, state: FSMContext) -> None:
    payment_method = callback.data.split(":", 1)[1]
    await state.update_data(payment_method=payment_method)
    await callback.answer()
    await ask_city(callback.message, state)


@router.callback_query(ExchangeForm.city, F.data.startswith("city:"))
async def set_city_choice(callback: CallbackQuery, state: FSMContext) -> None:
    city = callback.data.split(":", 1)[1]
    await state.update_data(city=city)
    await callback.answer()
    await ask_urgency(callback.message, state)


@router.message(ExchangeForm.city)
async def set_city(message: Message, state: FSMContext) -> None:
    city = (message.text or "").strip()
    if not city:
        await message.answer("Пожалуйста, укажите город или страну.")
        return
    await state.update_data(city=city)
    await ask_urgency(message, state)


@router.callback_query(ExchangeForm.urgency, F.data.startswith("urgency:"))
async def set_urgency(callback: CallbackQuery, state: FSMContext) -> None:
    urgency_key = callback.data.split(":", 1)[1]
    urgency_label = option_label(URGENCY_OPTIONS, urgency_key)
    await state.update_data(urgency_key=urgency_key, urgency_label=urgency_label)
    await callback.answer()
    await ask_contact(callback.message, state)


@router.message(ExchangeForm.contact)
async def set_contact(message: Message, state: FSMContext) -> None:
    phone_raw = ""
    if message.contact:
        phone_raw = message.contact.phone_number or ""
    else:
        phone_raw = message.text or ""

    phone = normalize_phone(phone_raw)
    if not phone:
        await message.answer(
            f"Не удалось распознать номер. Введите телефон в формате +7XXXXXXXXXX (мин. {PHONE_MIN_DIGITS} цифр)."
        )
        return

    await state.update_data(phone=phone)
    await message.answer("Спасибо!", reply_markup=ReplyKeyboardRemove())
    await show_summary(message, state)


@router.callback_query(ExchangeForm.confirm, F.data == "edit_request")
async def edit_request(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.clear()
    await ask_direction(callback.message, state)


@router.callback_query(ExchangeForm.confirm, F.data == "confirm_request")
async def confirm_request(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    data = await state.get_data()
    await finalize_request(callback.message, data, state)


@router.message(F.web_app_data)
async def handle_web_app(message: Message, state: FSMContext) -> None:
    try:
        payload = json.loads(message.web_app_data.data)
    except (json.JSONDecodeError, TypeError):
        await message.answer("Не удалось прочитать данные формы. Попробуйте еще раз.")
        return

    direction_key = payload.get("direction")
    urgency_key = payload.get("urgency")
    amount_value, amount_text = parse_amount(str(payload.get("amount", "")))

    data = {
        "direction_key": direction_key,
        "direction_label": option_label(DIRECTION_OPTIONS, direction_key),
        "from_currency": payload.get("from_currency"),
        "to_currency": payload.get("to_currency"),
        "amount_value": amount_value,
        "amount_text": amount_text or str(payload.get("amount")),
        "payment_method": payload.get("payment_method"),
        "city": payload.get("city"),
        "urgency_key": urgency_key,
        "urgency_label": option_label(URGENCY_OPTIONS, urgency_key),
        "phone": normalize_phone(str(payload.get("phone", ""))),
    }

    if not data.get("phone"):
        await message.answer("Не вижу номер телефона. Проверьте форму и попробуйте снова.")
        return

    await finalize_request(message, data, state)


@router.message(Command("stats"))
async def cmd_stats(message: Message) -> None:
    if not is_admin(message.from_user.id if message.from_user else None):
        await message.answer("Нет доступа.")
        return
    data = request_stats()
    await message.answer(
        "Статистика заявок:\n"
        f"Всего: {data['total']}\n"
        f"Высокий приоритет: {data['high']}"
    )


@router.message(Command("export"))
async def cmd_export(message: Message) -> None:
    if not is_admin(message.from_user.id if message.from_user else None):
        await message.answer("Нет доступа.")
        return

    parts = (message.text or "").split()
    if len(parts) == 3:
        start = parse_date(parts[1])
        end = parse_date(parts[2])
        if not start or not end:
            await message.answer("Формат: /export YYYY-MM-DD YYYY-MM-DD")
            return
    elif len(parts) == 2:
        start = parse_date(parts[1])
        if not start:
            await message.answer("Формат: /export YYYY-MM-DD YYYY-MM-DD")
            return
        end = date.today()
    else:
        end = date.today()
        start = end - timedelta(days=30)

    filename = f"requests_{start.isoformat()}_{end.isoformat()}.csv"
    export_path = Path("/tmp") / filename
    export_requests_csv(start, end, export_path)

    await message.answer_document(FSInputFile(export_path))


def parse_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


async def finalize_request(message: Message, data: dict, state: FSMContext | None) -> None:
    priority = classify_priority(data.get("urgency_key"), data.get("amount_value"))

    request = {
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "tg_user_id": str(message.from_user.id) if message.from_user else None,
        "tg_username": (
            f"@{message.from_user.username}" if message.from_user and message.from_user.username else None
        ),
        "direction_key": data.get("direction_key"),
        "direction_label": data.get("direction_label"),
        "from_currency": data.get("from_currency"),
        "to_currency": data.get("to_currency"),
        "amount_text": data.get("amount_text"),
        "amount_value": data.get("amount_value"),
        "payment_method": data.get("payment_method"),
        "city": data.get("city"),
        "urgency_key": data.get("urgency_key"),
        "urgency_label": data.get("urgency_label"),
        "phone": data.get("phone"),
        "priority": priority,
    }

    request_id, is_duplicate = save_request(request)
    request["id"] = request_id

    if not is_duplicate:
        await push_to_integrations(request)
        await notify_admins(message.bot, request)
    else:
        await notify_admins(message.bot, request)

    if state:
        await state.clear()

    if is_duplicate:
        await message.answer(DUPLICATE_MESSAGE)
        return

    await message.answer(f"{THANK_YOU_MESSAGE}\n\nВаш номер заявки: #{request_id}")


async def notify_admins(bot: Bot, request: dict) -> None:
    if not ADMIN_IDS:
        return
    text = format_request_message(request)
    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(admin_id, text)
        except Exception:
            logging.exception("Failed to notify admin %s", admin_id)


async def run_bot() -> None:
    setup_logging()
    init_db()
    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)

    logging.info("%s bot started", BRAND_NAME)
    await dp.start_polling(bot)
