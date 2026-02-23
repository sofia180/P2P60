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


class ConnectForm(StatesGroup):
    kind = State()
    exchange = State()
    exchange_custom = State()
    wallet_network = State()
    wallet_network_custom = State()
    identifier = State()
    confirm = State()
