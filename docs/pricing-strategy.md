# Valoryx Pricing Strategy

**Status:** Draft for team review
**Owner:** Logesh
**Last updated:** 2026-04-17

---

## TL;DR

We recommend a **4-tier subscription model** (₹2,999 → ₹29,999/yr) with a **Free Forever** tier and **Lifetime License** option. The sweet spot is **Tier 2 "Business" at ₹7,999/year** — that's where the product is strongest and where margins peak. Breakeven is ~15 customers.

---

## 1. Our cost floor

| Item | Cost (₹/year) |
|---|---|
| Supabase Pro ($25/mo) | 25,200 |
| VPS | 14,000 |
| Domain | 3,000 |
| **Total fixed infrastructure** | **42,200** |

### Per-customer cost
- **Offline installs:** ₹0/year (pure margin)
- **Cloud-synced installs:** Very low incremental cost until ~50–80 active customers, then Supabase Team tier jumps to ~₹6L/year

### Implication
Offline mode is our pricing weapon. Every offline-only customer is ~99% margin.

---

## 2. Competitive landscape

| Competitor | Price/year | Positioning |
|---|---|---|
| **Vyapar** | ₹1,999–₹3,999 | Mobile-first, small shop, lowest price |
| **myBillBook** | ₹1,999–₹4,999 | Zoho-backed, cloud-first |
| **Marg ERP** | ₹8,400–₹25,000 | Heavy ERP, pharmacy/wholesale |
| **Tally Prime** | ₹18,000 + AMC | Accounting, not POS-focused |
| **GoFrugal / Swipez** | ₹10,000–₹30,000 | Supermarket-grade, multi-outlet |
| **Ginesys** | ₹25,000+ | Chain stores, enterprise |

### Our sweet spot: ₹4,000–₹12,000/year
Better than Vyapar (desktop + cloud sync + offline-first), cheaper than GoFrugal.

**Strategy:** Do NOT compete on price with Vyapar. Compete on **features, desktop reliability, and offline-first capability**.

---

## 3. Customer segments

### A. Solo Kirana / Small shop
- Monthly sales: ₹10K–₹30K
- Setup: 1 counter, 1 user
- Willingness to pay: **₹2,500–₹4,000/year**
- Market size: 15M+ shops in India
- ⚠️ Price-sensitive, Vyapar already has them
- **Our play:** Free tier → convert to Starter when they grow

### B. Mid supermarket / Chain shop ⭐ PRIMARY TARGET
- Monthly sales: ₹50K–₹5L
- Setup: 2–5 counters, 2–10 users
- Willingness to pay: **₹8,000–₹15,000/year**
- Market size: 2M+ shops
- **Our play:** This is where Valoryx shines — multi-user, reporting, printer support

### C. Regional chain
- Monthly sales: ₹5L+
- Setup: 5+ outlets, multi-location
- Willingness to pay: **₹25,000–₹1,00,000/year**
- **Our play:** Enterprise tier with centralized dashboard

---

## 4. Proposed pricing tiers

### 🆓 Free Forever
- 1 counter
- 50 bills/month limit
- Watermark: "Powered by Valoryx" on receipts
- Community support only

**Purpose:** Lead-gen engine. ~15% typically upgrade after outgrowing limits.

---

### 🟢 Starter — ₹2,999/year
*One counter, one shop*

- 1 counter / 1 user
- Unlimited bills & products
- GST + non-GST billing
- Thermal printing (80mm)
- UPI QR with amount + bill number pre-filled
- Local offline storage + cloud sync
- Basic sales reports
- Email support

**Target:** Segment A (Kirana shops)

---

### 🟦 Business — ₹7,999/year ⭐ MOST POPULAR
*Small supermarkets*

Everything in Starter, plus:
- 3 counters / 3 concurrent users
- Customer management + loyalty tracking
- Multiple payment splits per bill
- Bill exchange / returns
- Advanced reports (profit margins, top products)
- Barcode label printing
- Pending bills / Khata
- WhatsApp bill sharing
- Priority email + phone support

**Target:** Segment B (our primary market)

---

### 🟣 Professional — ₹14,999/year
*Multi-counter supermarkets*

Everything in Business, plus:
- Unlimited counters per outlet
- Staff roles & permissions
- Multi-user audit logs
- Advanced GST reports (B2B invoices, e-way bill ready)
- Razorpay / UPI payment gateway integration
- Custom receipt branding
- Onsite support (1 visit/year included)

**Target:** Upper Segment B / lower Segment C

---

### 🔶 Chain — ₹29,999/year + ₹5,000/additional outlet
*Multi-outlet chains*

Everything in Professional, plus:
- Centralized dashboard across outlets
- Cross-outlet stock transfer
- Consolidated reporting
- Franchise admin roles
- Dedicated account manager
- Onboarding + training included

**Target:** Segment C

---

## 5. Pricing tactics

### 🎁 Lifetime License (one-time) — wildcard
Indian shop owners hate subscriptions. Many pay more upfront than subscribe.

- **Starter Lifetime:** ₹9,999 one-time (~3.3 yrs of yearly)
- **Business Lifetime:** ₹24,999 one-time
- Includes 1 year of updates; after that ₹1,999/year for updates + support

**Why:** Upfront cash flow + attracts subscription-averse buyers. Vyapar does this and it works.

---

### 📆 Monthly option (Starter & Business only)
- **Starter Monthly:** ₹349/month (30% premium vs yearly)
- **Business Monthly:** ₹899/month

Catches commitment-shy shopkeepers, encourages yearly upgrade.

---

### 💥 Early-customer discount
- **First 3 months of launch:** 50% off first year
- Creates urgency, generates early testimonials + case studies

---

### 🎓 Onboarding add-on (separate, not bundled)
- **"Setup + train at your shop"** — ₹2,500 flat fee
- Most shop owners are not tech-comfortable
- Doubles revenue per customer AND builds relationship

**Rule:** Never bundle this free. Customers value what they pay for.

---

### 🏬 Multi-shop pack
- **2 outlets:** ₹12,999/year (save vs 2× Business)
- **5 outlets:** ₹49,999/year

---

## 6. Revenue projections (Year 1)

Assume 200 paying customers over 6 months of active effort:

| Tier | Customers | Price | Revenue |
|---|---:|---:|---:|
| Starter yearly | 100 | ₹2,999 | ₹2,99,900 |
| Business yearly | 60 | ₹7,999 | ₹4,79,940 |
| Professional | 20 | ₹14,999 | ₹2,99,980 |
| Lifetime (Starter) | 15 | ₹9,999 | ₹1,49,985 |
| Lifetime (Business) | 5 | ₹24,999 | ₹1,24,995 |
| **Total Y1** | **200** | | **₹13,54,800** |

**Infrastructure cost:** ₹42,200
**Gross margin:** ~97%
**Recurring revenue locked for Y2:** ~₹8–10L

---

## 7. Go-to-market sequence

### Phase 1 — Validation (Month 1)
- Set up the 4 tiers in landing page
- Pick 5 friendly shops for Business-tier pilot at ₹3,999 (50% off)
- Collect testimonials + case studies
- Document "Day in the life of a cashier" video

### Phase 2 — Soft launch (Month 2–3)
- Free tier live with Valoryx watermark
- Paid tiers open at launch-discount prices
- Direct outreach to 100 shops in 2 cities (Coimbatore + 1 more)
- Add onboarding add-on
- WhatsApp + Instagram marketing

### Phase 3 — Scale (Month 4–6)
- Remove launch discount, move to full pricing
- Hire 1 field sales rep for Tier 2+ customers
- Referral program: existing customer gets 2 months free for every new paid referral
- Target 200 paying customers by Month 6

---

## 8. Open questions for team discussion

These need answers before we finalize the pricing page:

1. **What does Valoryx do TODAY that Vyapar/Marg/myBillBook DON'T?**
   - Why would a shop switch from Vyapar to us?
   - This is our landing-page headline — currently unclear.

2. **Scope:** Pure retail/supermarket only, or do we also support restaurants / wholesale / services?
   - Each adds features but dilutes positioning.

3. **First 5 customers:** What are they paying right now (if anything)?
   - Reality check on willingness to pay.

4. **Can Valoryx run FULLY offline (no Supabase at all)?**
   - If yes, "Offline-Only Starter at ₹2,499/year" is a killer feature.
   - Pure margin since zero recurring cost to us.

5. **Payment infrastructure:** Are we using Razorpay Subscriptions, Stripe, or bank transfer for recurring billing?
   - Affects pricing tier UX (monthly vs yearly options).

---

## 9. Key decisions needed

| Decision | Owner | Deadline |
|---|---|---|
| Approve final tier prices | Team | TBD |
| Set up payment gateway for subscriptions | Engineering | TBD |
| Design pricing page on valoryx.com | Design + Eng | TBD |
| Pick pilot customers for validation | Logesh | TBD |
| Record onboarding/demo video | Marketing | TBD |
| Launch date | Team | TBD |

---

## 10. Guiding principles

1. **Don't race to the bottom with Vyapar.** We lose on price-only.
2. **Lead with Business tier (₹7,999)** in all marketing. "Most Popular" badge.
3. **Lifetime licenses convert well in India** — offer them prominently.
4. **Free tier is the best marketing spend** we have. Don't skip it.
5. **Sell onboarding as a paid add-on**, never bundle it free.
6. **Offline mode is our margin moat** — lean into it.

---

*Draft v1 — ready for review. Ping @logesh with feedback before next team meeting.*
