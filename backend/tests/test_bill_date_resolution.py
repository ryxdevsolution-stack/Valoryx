"""Bill timestamps: the browser sends a UTC bill_date captured when Create Bill opened.

_resolve_bill_date must store shop time (naive IST, like every other bill timestamp),
use the real save time for today's bills, keep back-dated days, and reject the future.
"""
from datetime import datetime

from dateutil import parser

from routes.billing import _resolve_bill_date

NOW = datetime(2026, 11, 10, 13, 32, 6)  # naive IST, as get_current_time() returns


def test_today_utc_page_load_time_becomes_save_time():
    assert _resolve_bill_date(parser.parse('2026-11-10T08:02:06.463Z'), NOW) == NOW


def test_after_midnight_ist_is_still_today():
    just_after_midnight = datetime(2026, 11, 10, 0, 15)
    # 00:15 IST is 18:45 UTC the previous day
    assert _resolve_bill_date(parser.parse('2026-11-09T18:45:00Z'), just_after_midnight) == just_after_midnight


def test_backdated_bill_keeps_its_date_in_ist():
    assert _resolve_bill_date(parser.parse('2026-11-07T08:00:00Z'), NOW) == datetime(2026, 11, 7, 13, 30)


def test_future_date_rejected():
    assert _resolve_bill_date(parser.parse('2026-11-11T05:00:00Z'), NOW) is None


def test_two_bills_from_same_page_get_distinct_save_times():
    sent = parser.parse('2026-11-10T08:02:06.463Z')  # same stale value for both
    first = _resolve_bill_date(sent, datetime(2026, 11, 10, 13, 32, 6))
    second = _resolve_bill_date(sent, datetime(2026, 11, 10, 13, 35, 40))
    assert first != second
