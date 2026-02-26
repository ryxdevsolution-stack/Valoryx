"""
Telegram message sender for RYX Billing daily reports.
Uses httpx (already in requirements.txt) — no new dependencies needed.
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)


def send_telegram_message(chat_id: str, text: str) -> bool:
    """
    Send a message to a Telegram chat via the Bot API.

    Args:
        chat_id: The recipient's Telegram chat ID (stored in client_entry.telegram_chat_id).
        text:    HTML-formatted message body.

    Returns:
        True if the message was delivered, False on any failure.
        Never raises — all errors are logged safely.
    """
    token = os.getenv('TELEGRAM_BOT_TOKEN', '')
    if not token:
        logger.warning("[Telegram] TELEGRAM_BOT_TOKEN not configured — message skipped")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        'chat_id': chat_id,
        'text': text,
        'parse_mode': 'HTML',
    }

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(url, json=payload)
            data = resp.json()

            if resp.status_code == 200 and data.get('ok'):
                logger.info(f"[Telegram] Message delivered to chat {chat_id}")
                return True

            # Telegram returned an error (bad token, blocked bot, invalid chat ID, etc.)
            logger.error(
                f"[Telegram] Delivery failed for chat {chat_id}: "
                f"HTTP {resp.status_code} — {data.get('description', 'no description')}"
            )
            return False

    except httpx.TimeoutException:
        logger.error(f"[Telegram] Request timed out for chat {chat_id}")
        return False
    except Exception as e:
        logger.error(f"[Telegram] Unexpected error sending to chat {chat_id}: {e}")
        return False
