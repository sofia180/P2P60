from __future__ import annotations

from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from config import CRYPTO_KEY


class CryptoUnavailable(Exception):
    pass


def _get_fernet() -> Fernet:
    if not CRYPTO_KEY:
        raise CryptoUnavailable("CRYPTO_KEY is not configured")
    return Fernet(CRYPTO_KEY.encode())


def encrypt_value(value: str | None) -> str | None:
    if not value:
        return None
    fernet = _get_fernet()
    return fernet.encrypt(value.encode()).decode()


def decrypt_value(token: str | None) -> Optional[str]:
    if not token:
        return None
    fernet = _get_fernet()
    try:
        return fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return None
