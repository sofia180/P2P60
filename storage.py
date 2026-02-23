from __future__ import annotations

import csv
import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from config import (
    CRM_WEBHOOK_URL,
    GOOGLE_SHEETS_WEBHOOK_URL,
    GOOGLE_SHEETS_CSV_PATH,
    WEBHOOK_TIMEOUT_SECONDS,
)

DB_PATH = Path(__file__).with_name("requests.db")


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                tg_user_id TEXT,
                tg_username TEXT,
                direction_key TEXT,
                direction_label TEXT,
                from_currency TEXT,
                to_currency TEXT,
                amount_text TEXT,
                amount_value REAL,
                payment_method TEXT,
                city TEXT,
                urgency_key TEXT,
                urgency_label TEXT,
                phone TEXT UNIQUE NOT NULL,
                priority TEXT,
                duplicate_count INTEGER DEFAULT 0,
                raw_payload TEXT
            );
            """
        )


def save_request(request: dict[str, Any]) -> tuple[int, bool]:
    with get_conn() as conn:
        try:
            cur = conn.execute(
                """
                INSERT INTO requests (
                    tg_user_id, tg_username, direction_key, direction_label,
                    from_currency, to_currency, amount_text, amount_value,
                    payment_method, city, urgency_key, urgency_label, phone,
                    priority, raw_payload
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    request.get("tg_user_id"),
                    request.get("tg_username"),
                    request.get("direction_key"),
                    request.get("direction_label"),
                    request.get("from_currency"),
                    request.get("to_currency"),
                    request.get("amount_text"),
                    request.get("amount_value"),
                    request.get("payment_method"),
                    request.get("city"),
                    request.get("urgency_key"),
                    request.get("urgency_label"),
                    request.get("phone"),
                    request.get("priority"),
                    json.dumps(request, ensure_ascii=False),
                ),
            )
            return int(cur.lastrowid), False
        except sqlite3.IntegrityError:
            conn.execute(
                """
                UPDATE requests
                SET updated_at=CURRENT_TIMESTAMP,
                    tg_user_id=?,
                    tg_username=?,
                    direction_key=?,
                    direction_label=?,
                    from_currency=?,
                    to_currency=?,
                    amount_text=?,
                    amount_value=?,
                    payment_method=?,
                    city=?,
                    urgency_key=?,
                    urgency_label=?,
                    priority=?,
                    duplicate_count=duplicate_count+1,
                    raw_payload=?
                WHERE phone=?
                """,
                (
                    request.get("tg_user_id"),
                    request.get("tg_username"),
                    request.get("direction_key"),
                    request.get("direction_label"),
                    request.get("from_currency"),
                    request.get("to_currency"),
                    request.get("amount_text"),
                    request.get("amount_value"),
                    request.get("payment_method"),
                    request.get("city"),
                    request.get("urgency_key"),
                    request.get("urgency_label"),
                    request.get("priority"),
                    json.dumps(request, ensure_ascii=False),
                    request.get("phone"),
                ),
            )
            row = conn.execute(
                "SELECT id FROM requests WHERE phone=?",
                (request.get("phone"),),
            ).fetchone()
            return int(row["id"]) if row else 0, True


def stats() -> dict[str, int]:
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM requests").fetchone()["c"]
        high = conn.execute(
            "SELECT COUNT(*) AS c FROM requests WHERE priority='high'"
        ).fetchone()["c"]
    return {"total": total, "high": high}


def export_requests_csv(start: date, end: date, output_path: Path) -> Path:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT created_at, direction_label, from_currency, to_currency,
                   amount_text, payment_method, city, urgency_label, phone, priority
            FROM requests
            WHERE date(created_at) BETWEEN date(?) AND date(?)
            ORDER BY created_at ASC
            """,
            (start.isoformat(), end.isoformat()),
        ).fetchall()

    headers = [
        "created_at",
        "direction",
        "from_currency",
        "to_currency",
        "amount",
        "payment_method",
        "city",
        "urgency",
        "phone",
        "priority",
    ]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(
                [
                    row["created_at"],
                    row["direction_label"],
                    row["from_currency"],
                    row["to_currency"],
                    row["amount_text"],
                    row["payment_method"],
                    row["city"],
                    row["urgency_label"],
                    row["phone"],
                    row["priority"],
                ]
            )

    return output_path


async def push_to_integrations(request: dict[str, Any]) -> None:
    payload = {
        "created_at": request.get("created_at"),
        "direction": request.get("direction_label"),
        "from_currency": request.get("from_currency"),
        "to_currency": request.get("to_currency"),
        "amount": request.get("amount_text"),
        "payment_method": request.get("payment_method"),
        "city": request.get("city"),
        "urgency": request.get("urgency_label"),
        "phone": request.get("phone"),
        "priority": request.get("priority"),
        "tg_user_id": request.get("tg_user_id"),
        "tg_username": request.get("tg_username"),
    }

    await _post_webhook(CRM_WEBHOOK_URL, payload)
    await _post_webhook(GOOGLE_SHEETS_WEBHOOK_URL, payload)

    if GOOGLE_SHEETS_CSV_PATH:
        _append_csv(Path(GOOGLE_SHEETS_CSV_PATH), payload)


async def _post_webhook(url: str, payload: dict[str, Any]) -> None:
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_SECONDS) as client:
            response = await client.post(url, json=payload)
            if response.status_code >= 400:
                logging.error(
                    "Webhook push failed: %s status=%s body=%s",
                    url,
                    response.status_code,
                    response.text[:500],
                )
    except Exception:
        logging.exception("Webhook push failed: %s", url)


def _append_csv(path: Path, payload: dict[str, Any]) -> None:
    headers = [
        "created_at",
        "direction",
        "from_currency",
        "to_currency",
        "amount",
        "payment_method",
        "city",
        "urgency",
        "phone",
        "priority",
        "tg_user_id",
        "tg_username",
    ]

    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        if write_header:
            writer.writeheader()
        writer.writerow(
            {
                "created_at": payload.get("created_at"),
                "direction": payload.get("direction"),
                "from_currency": payload.get("from_currency"),
                "to_currency": payload.get("to_currency"),
                "amount": payload.get("amount"),
                "payment_method": payload.get("payment_method"),
                "city": payload.get("city"),
                "urgency": payload.get("urgency"),
                "phone": payload.get("phone"),
                "priority": payload.get("priority"),
                "tg_user_id": payload.get("tg_user_id"),
                "tg_username": payload.get("tg_username"),
            }
        )


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
