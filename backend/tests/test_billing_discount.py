"""Tests for per-line customer discount on the unified bill endpoint (/billing/create).

Regression guard for the bug where create_unified_bill recomputed each line from
quantity*rate and ignored discount_percentage, charging the customer full price.
"""
import json
import pytest


def _discounted_body(product_id, discount_pct=10.0):
    return {
        "customer_name": "Disc Customer",
        "items": [
            {
                "product_id": str(product_id),
                "product_name": "Widget",
                "quantity": 2,
                "rate": 500.0,
                "gst_percentage": 18.0,
                "discount_percentage": discount_pct,
                "gst_amount": 162.0,
                "amount": 1062.0,
                "item_code": "WDG-001",
                "unit": "pcs",
                "hsn_code": "8471",
            }
        ],
        "payment_type": json.dumps([{"payment_type": "Cash", "amount": 1062.0}]),
        "amount_received": 1062.0,
        "discount_percentage": 0,
        "payment_status": "paid",
    }


def test_create_bill_applies_line_discount(http, sample_stock, gst_headers):
    """A 10% line discount: 2*500*0.9 = 900 taxable, +18% GST = 1062 total."""
    body = _discounted_body(sample_stock.product_id, 10.0)
    resp = http.post(
        "/api/billing/create",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code in (200, 201), resp.get_json()
    data = resp.get_json()
    assert data["final_amount"] == pytest.approx(1062.0, abs=0.01)

    item = data["bill"]["items"][0]
    assert item["amount"] == pytest.approx(1062.0, abs=0.01)
    assert item["gst_amount"] == pytest.approx(162.0, abs=0.01)
    assert item["discount_percentage"] == pytest.approx(10.0, abs=0.01)


def test_create_bill_clamps_out_of_range_discount(http, sample_stock, gst_headers):
    """A 150% discount is clamped to 100 → line total floors at 0."""
    body = _discounted_body(sample_stock.product_id, 150.0)
    resp = http.post(
        "/api/billing/create",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code in (200, 201), resp.get_json()
    item = resp.get_json()["bill"]["items"][0]
    assert item["discount_percentage"] == pytest.approx(100.0, abs=0.01)
    assert item["amount"] == pytest.approx(0.0, abs=0.01)


def test_create_bill_no_discount_unchanged(http, sample_stock, gst_headers):
    """No discount → full price preserved (2*500 + 18% = 1180)."""
    body = _discounted_body(sample_stock.product_id, 0.0)
    resp = http.post(
        "/api/billing/create",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code in (200, 201), resp.get_json()
    assert resp.get_json()["final_amount"] == pytest.approx(1180.0, abs=0.01)
