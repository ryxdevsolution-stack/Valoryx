# Global Billing Plan — India + Foreign Support

**Status:** Planning  
**Date:** 2026-06-23  
**Author:** Logesh (logesh@thinqfactory.com)

---

## Why This Plan Exists

Valoryx started as an India-only product. The payment stack was built entirely on **Razorpay** — which is the right choice for India: it supports UPI AutoPay, eMandate (NACH), Indian cards, and settles in INR to an Indian bank account.

The problem arose when we started getting users from outside India. Razorpay simply does not work for foreign customers:

- **UPI AutoPay** is India-only — no UPI app exists outside India.
- **eMandate / NACH** is tied to Indian bank accounts — foreign banks cannot register.
- **International card recurring** via Razorpay requires a special approval process, is limited, and still settles only in INR under strict RBI/FEMA rules.
- Even if a foreign card goes through, **Razorpay fees exceed the transaction amount** for small plans (we saw this firsthand — 9 test users on a ₹1 plan resulted in a **-₹9 balance** because the gateway fee was larger than the revenue).

So the core problem is: **one gateway cannot serve both India and the world.**

---

## Why Lemon Squeezy (and not Stripe)

The obvious alternative is Stripe. But Stripe has a critical constraint for India-registered businesses:

- Stripe India settles in INR and has its own recurring payment restrictions (same RBI rules).
- To use Stripe globally and receive USD/EUR settlements, you need a **US, UK, or EU legal entity** — which we don't have.
- Stripe also makes **you** responsible for collecting and filing VAT in the EU, GST in Australia, sales tax across all US states, etc. That is a full-time compliance job.

**Lemon Squeezy is a Merchant of Record (MoR).** This means:

- They are legally the seller of record, not us.
- They handle all global tax collection and filing (EU VAT, US sales tax, Australian GST, etc.) automatically.
- They pay out to our Indian bank account after deducting their fee (~5%).
- No foreign company registration required.
- Works for any country, any currency.

The ~5% fee is the price of never having to think about international tax law. For our stage, that is the right trade-off.

---

## Why Dual Gateway (not replace Razorpay)

We are NOT replacing Razorpay. Indian users stay on Razorpay because:

- Razorpay UPI AutoPay has near-zero friction for Indian users — they just approve on their UPI app.
- Razorpay fees (~2%) are lower than Lemon Squeezy (~5%) for Indian transactions.
- We already have a fully working, battle-tested Razorpay integration with webhooks, idempotency, and auto-capture.
- Switching Indian users to a card-based Lemon Squeezy checkout would hurt conversion significantly.

The solution is a **geo-router**: detect the customer's country from `client_entry.country` (already stored in Supabase on first login), and send them to the right gateway. Indian users never know Lemon Squeezy exists. Foreign users never see Razorpay.

---

## Why Route by `client_entry.country`

On first login, the client's country is already being detected and saved to the `client_entry` table in Supabase (`country`, `currency_code`, `currency_symbol`, `locale` columns). This was built but not yet reflected in the SQLAlchemy models — so the backend cannot read it yet.

Using the stored country is better than detecting from request IP at checkout time because:

- The user's IP at checkout might be a VPN or proxy.
- The country was confirmed at account creation time — it is the most reliable signal we have.
- It is already there in the DB — no new detection logic needed.

---

## Why Lemon Squeezy Uses a Hosted Checkout (not embedded)

Razorpay opens a modal inside the app. Lemon Squeezy redirects to their hosted checkout page. This is intentional:

- Lemon Squeezy's hosted checkout handles **3DS authentication**, **local payment methods**, and **tax collection UI** — all of which vary by country.
- Embedding their checkout would require us to build country-specific UI for tax fields, currency display, and payment method selection.
- Their hosted page is PCI-compliant by design — we never touch card data.
- After payment, they redirect back to our app and fire a webhook, same as Razorpay.

---

## Why the Activation Logic Is Shared

Both Razorpay and Lemon Squeezy ultimately need to do the same thing after a successful payment:

1. Set `client_entry.subscription_status = 'active'`
2. Set `client_entry.subscription_end_date`
3. Set `client_entry.plan_id`
4. Record a `PaymentTransaction`
5. Send a confirmation email

Rather than duplicating this logic, the existing `_activate_subscription()` helper in `subscription.py` is reused by both gateways. The Lemon Squeezy webhook handler calls the same activation path. This means the rest of the app — access control, trial expiry checks, the `/upgrade` redirect — never needs to know which gateway was used.

---

## Architecture

```
User clicks Subscribe
        ↓
  client_entry.country?
        ↓
   ┌────┴────┐
  'IN'      anything else
   ↓              ↓
Razorpay    Lemon Squeezy
(existing)  (new — hosted checkout)
   ↓              ↓
   └────┬─────────┘
        ↓
  Same ClientEntry.subscription_status = 'active'
  Same subscription_end_date, plan_id
  Rest of app never knows which gateway paid
```

---

## Step 1 — Backend Models

### `backend/models/client_model.py`
Add columns that already exist in Supabase but are missing from the SQLAlchemy model:

| Column | Type | Default | Notes |
|---|---|---|---|
| `country` | String(2) | `'IN'` | ISO-3166 e.g. `'IN'`, `'US'`, `'GB'` |
| `currency_code` | String(3) | `'INR'` | e.g. `'INR'`, `'USD'` |
| `currency_symbol` | String(5) | `'₹'` | e.g. `'₹'`, `'$'` |
| `locale` | String(10) | `'en-IN'` | e.g. `'en-IN'`, `'en-US'` |
| `lemon_squeezy_subscription_id` | String(100) | null | **New — needs migration** |

### `backend/models/subscription_model.py`
Add to **`SubscriptionPlan`**:

| Column | Type | Notes |
|---|---|---|
| `usd_monthly_price` | Integer | In cents. e.g. $9 = 900 |
| `usd_yearly_price` | Integer | In cents |
| `ls_monthly_variant_id` | String(100) | Lemon Squeezy variant ID for monthly plan |
| `ls_yearly_variant_id` | String(100) | Lemon Squeezy variant ID for yearly plan |

Add to **`PaymentTransaction`**:

| Column | Type | Default | Notes |
|---|---|---|---|
| `gateway` | String(20) | `'razorpay'` | `'razorpay'` or `'lemonsqueezy'` |
| `ls_subscription_id` | String(100) | null | Lemon Squeezy subscription ID |
| `ls_order_id` | String(100) | null | Lemon Squeezy order ID |

---

## Step 2 — Config

**`backend/config.py`** — Add Lemon Squeezy env vars:

```python
LEMONSQUEEZY_API_KEY      = os.getenv('LEMONSQUEEZY_API_KEY', '')
LEMONSQUEEZY_STORE_ID     = os.getenv('LEMONSQUEEZY_STORE_ID', '')
LEMONSQUEEZY_WEBHOOK_SECRET = os.getenv('LEMONSQUEEZY_WEBHOOK_SECRET', '')
```

Add to `.env`:
```
LEMONSQUEEZY_API_KEY=your_api_key_here
LEMONSQUEEZY_STORE_ID=your_store_id_here
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret_here
```

---

## Step 3 — New Backend Route

**`backend/routes/lemonsqueezy.py`** _(new file)_

Endpoints:
- `POST /subscription/webhook/lemonsqueezy`
  - Verify `X-Signature` HMAC-SHA256 header
  - Handle events:
    - `subscription_created` → activate subscription
    - `subscription_payment_success` → renew subscription
    - `subscription_cancelled` → mark cancelled, keep access until end date
    - `subscription_expired` → mark expired

Reuses existing `_activate_subscription()` logic from `subscription.py` — no duplication.

---

## Step 4 — Update Existing Route

**`backend/routes/subscription.py`** — Update `create-subscription` endpoint:

```
Before: always creates Razorpay subscription
After:  checks client_entry.country → routes to correct gateway
```

New response shape (adds `gateway` field):
```json
// India (country = 'IN'):
{
  "gateway": "razorpay",
  "subscription_id": "sub_xxx",
  "razorpay_key_id": "rzp_live_xxx",
  "plan_name": "Pro",
  "billing_cycle": "monthly"
}

// Foreign (country != 'IN'):
{
  "gateway": "lemonsqueezy",
  "checkout_url": "https://valoryx.lemonsqueezy.com/checkout/buy/xxx"
}
```

If `LEMONSQUEEZY_API_KEY` is not set, returns `503` for foreign users — Indian users unaffected.

---

## Step 5 — Migration SQL

**`backend/migrations/add_global_billing.sql`** _(new file)_ — Run once in Supabase SQL editor.

Adds only columns that do NOT yet exist in Supabase:

```sql
-- client_entry
ALTER TABLE client_entry
  ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id VARCHAR(100);

-- payment_transaction
ALTER TABLE payment_transaction
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(20) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS ls_subscription_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ls_order_id VARCHAR(100);

-- subscription_plan
ALTER TABLE subscription_plan
  ADD COLUMN IF NOT EXISTS usd_monthly_price INTEGER,
  ADD COLUMN IF NOT EXISTS usd_yearly_price INTEGER,
  ADD COLUMN IF NOT EXISTS ls_monthly_variant_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ls_yearly_variant_id VARCHAR(100);
```

> Note: `country`, `currency_code`, `currency_symbol`, `locale` already exist in Supabase — no migration needed for those.

---

## Step 6 — Frontend

**`frontend-react/src/components/PricingCards.tsx`**

Update `handleSubscribe` to handle both gateways:

```ts
const res = await api.post('/subscription/create-subscription', { plan_id, billing_cycle })

if (res.data.gateway === 'razorpay') {
  // existing Razorpay modal — zero change to this path
  const { subscription_id, razorpay_key_id, plan_name } = res.data
  // ... open rzp modal as today
} else {
  // foreign: redirect to Lemon Squeezy hosted checkout
  window.location.href = res.data.checkout_url
}
```

Update `formatPrice` to show USD for foreign clients (read `client.currency_code` from context).

---

## Step 7 — Register Blueprint

**`backend/app.py`** — Add 3 lines alongside the existing subscription blueprint registration:

```python
try:
    from routes.lemonsqueezy import lemonsqueezy_bp
    app.register_blueprint(lemonsqueezy_bp, url_prefix='/api/subscription')
except Exception as e:
    logging.error(f"Failed to import lemonsqueezy blueprint: {e}")
```

---

## What Stays Unchanged

- All existing Razorpay code — Indian users feel zero difference
- `/subscription/webhook` (Razorpay webhook) — untouched
- `/subscription/verify-payment` — Razorpay only, untouched
- `_activate_subscription()` helper — LS reuses it

---

## Prerequisites Before Going Live

| Task | Who | Status |
|---|---|---|
| Create Lemon Squeezy account + store | You | ⬜ Pending |
| Add plans as products in LS dashboard, get variant IDs | You | ⬜ Pending |
| Set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET` in `.env` | You | ⬜ Pending |
| Run `add_global_billing.sql` in Supabase | You | ⬜ Pending |
| Seed USD prices + LS variant IDs into `subscription_plan` table | You | ⬜ Pending |
| Set webhook URL in LS dashboard → `https://your-domain.com/api/subscription/webhook/lemonsqueezy` | You | ⬜ Pending |
| Build all 7 code changes | Claude | ⬜ Pending |

---

## File Change Summary

| File | Change Type |
|---|---|
| `backend/models/client_model.py` | Modify — add 5 columns |
| `backend/models/subscription_model.py` | Modify — add 7 columns |
| `backend/config.py` | Modify — add 3 env vars |
| `backend/routes/lemonsqueezy.py` | **New file** |
| `backend/routes/subscription.py` | Modify — geo-route in `create-subscription` |
| `backend/migrations/add_global_billing.sql` | **New file** |
| `frontend-react/src/components/PricingCards.tsx` | Modify — dual gateway checkout |
| `backend/app.py` | Modify — register new blueprint |
