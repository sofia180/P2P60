from aiogram.fsm.state import StatesGroup, State


class ExchangeForm(StatesGroup):
    direction = State()
    from_currency = State()
    to_currency = State()
    amount = State()
    payment = State()
    city = State()
    urgency = State()
    contact = State()
    confirm = State()
