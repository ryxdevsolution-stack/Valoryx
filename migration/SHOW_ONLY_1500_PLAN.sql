-- Show only the ₹1500/month (₹17,000/year) plan on the pricing + upgrade pages.
--
-- The pricing pages render whatever GET /subscription/plans returns, which is
-- every subscription_plan row with is_active = true. So "show one plan" means
-- hiding the rest. Nothing is deleted: the rows, their Razorpay plan IDs and
-- every payment_transaction FK stay intact, so clients already subscribed to a
-- hidden plan keep billing normally and any plan can be brought back instantly.
--
-- Run against the Supabase (cloud) database.

-- 1. Confirm the ₹1500 plan is there and priced as expected (150000 paise
--    monthly / 1700000 paise yearly). Check this BEFORE running step 2.
SELECT plan_id, name, monthly_price, yearly_price, currency, is_active, display_order
FROM subscription_plan
ORDER BY currency, display_order;

-- 2. Hide every other INR plan. Matches on price so it cannot hide the wrong
--    row if plan names differ from what is expected.
UPDATE subscription_plan
SET is_active = false
WHERE currency = 'INR'
  AND is_active = true
  AND monthly_price <> 150000;

-- 3. Verify exactly one INR plan is visible.
SELECT name, monthly_price, yearly_price, is_active
FROM subscription_plan
WHERE currency = 'INR' AND is_active = true;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- UPDATE subscription_plan SET is_active = true
-- WHERE currency = 'INR' AND monthly_price IN (99900, 249900, 799900);

-- ── After running ───────────────────────────────────────────────────────────
-- The plans response is cached server-side for 10 min and in the browser for
-- 5 min, so the pricing page can keep showing the old plans for a few minutes.
-- Restart the backend to clear it immediately.
