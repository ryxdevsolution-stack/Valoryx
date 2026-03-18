# RYX Billing — Growth Hacking Strategy 2026

**Document Version:** 1.0
**Last Updated:** 2026-03-17
**Author:** Growth Team
**Status:** Active

---

## Table of Contents

1. [North Star Metric & Growth Model](#1-north-star-metric--growth-model)
2. [Ideal Customer Profile (ICP)](#2-ideal-customer-profile-icp)
3. [Top 5 Growth Channels](#3-top-5-growth-channels-prioritized)
4. [Viral Loop & Referral Program](#4-viral-loop--referral-program-design)
5. [Onboarding Optimization](#5-onboarding-optimization-activation)
6. [Retention Playbook](#6-retention-playbook)
7. [Content Marketing Plan](#7-content-marketing-plan)
8. [Experiment Backlog](#8-experiment-backlog-10-experiments)
9. [90-Day Sprint Plan](#9-90-day-sprint-plan)
10. [Key Metrics Dashboard](#10-key-metrics-dashboard)

---

## 1. North Star Metric & Growth Model

### North Star Metric (NSM)

> **"Number of bills created per month across all active tenants"**

**Why this metric:**
- A bill created = the product is delivering real value (business is transacting)
- Correlates directly with user activation, retention, and revenue
- Increasing bill volume means businesses depend on RYX Billing daily
- Proxy for GMV processed through the platform (future monetization lever)

**NSM Target:**
| Period | Bills/Month |
|--------|-------------|
| Today (baseline) | ~5,000 |
| Month 3 | 25,000 |
| Month 6 | 75,000 |
| Month 12 | 250,000 |

---

### AARRR Growth Model

```
ACQUISITION  →  ACTIVATION  →  RETENTION  →  REVENUE  →  REFERRAL
     |               |              |             |            |
  How users       First         Keep them      Convert      Turn them
  find us         "aha"         engaged        to paid      into growth
```

#### Acquisition
- **Goal:** Drive qualified trial signups from Indian SMBs
- **Primary levers:** Google Search (GST billing queries), WhatsApp referrals, YouTube
- **Metric:** Monthly Trial Signups (MTS)
- **Funnel:** Landing page visit → Signup → Email verified → First login

#### Activation
- **Aha Moment:** First GST-compliant bill created and downloaded as PDF
- **Goal:** 60% of signups create their first bill within 48 hours
- **Metric:** Day-2 Activation Rate
- **Funnel:** First login → Business setup → First product added → First bill created

#### Retention
- **Goal:** 70% of activated users still active at Day 30
- **Metric:** D7, D30, D90 retention cohort rates
- **Lever:** In-app engagement, email drips, feature discovery nudges

#### Revenue
- **Goal:** 25% trial-to-paid conversion rate
- **Metric:** Trial Conversion Rate (TCR)
- **Lever:** Value demonstration before Day 14, upgrade prompts, plan comparisons
- **ARPU target:** ₹999/month average

#### Referral
- **Goal:** K-factor of 1.2 (each paying customer brings 1.2 new signups)
- **Metric:** Viral Coefficient (K-factor)
- **Lever:** Invoice watermark, referral program, WhatsApp sharing

---

### 90-Day Targets

| Metric | Baseline | Day 30 | Day 60 | Day 90 |
|--------|----------|--------|--------|--------|
| Monthly Trial Signups | 100 | 300 | 600 | 1,000 |
| Day-2 Activation Rate | 30% | 45% | 55% | 65% |
| Trial-to-Paid Conversion | 10% | 15% | 20% | 25% |
| D30 Retention | 40% | 50% | 60% | 70% |
| MRR | ₹30K | ₹90K | ₹2L | ₹5L |
| K-factor | 0.3 | 0.6 | 0.9 | 1.2 |

### 12-Month Targets

| Metric | Month 6 | Month 12 |
|--------|---------|---------|
| Paying Customers | 500 | 2,000 |
| MRR | ₹5L | ₹20L |
| ARR | ₹60L | ₹2.4Cr |
| Bills/Month | 75,000 | 250,000 |
| NPS Score | 40 | 60 |

---

## 2. Ideal Customer Profile (ICP)

### Primary ICP — "The GST-Registered Shopkeeper"

| Attribute | Description |
|-----------|-------------|
| **Industry** | Retail (kirana, electronics, clothing), Restaurant/cafe, Pharmacy, Hardware store |
| **Business Size** | 1–10 employees, single location |
| **Annual Revenue** | ₹25L – ₹5Cr turnover |
| **GST Status** | Registered under GST (mandatory compliance need) |
| **Location** | Tier 1 & Tier 2 Indian cities (Mumbai, Pune, Hyderabad, Chennai, Bengaluru, Jaipur, Lucknow, Surat) |
| **Tech Comfort** | Moderate — uses WhatsApp, UPI, basic Android apps |
| **Device** | Android smartphone + Windows PC or just smartphone |
| **Current Solution** | Manual paper bills, Excel, Vyapar basic, or Tally (too complex) |

**Pain Points:**
1. GST return filing takes hours — wants auto-organized reports
2. Tally is expensive and requires a trained accountant
3. Stock management done on paper or separate Excel sheets
4. Cannot generate professional PDF invoices quickly
5. No visibility into daily/monthly profit or top-selling products
6. Multi-user access needed (one owner + 2 staff) but no good affordable option

**Trigger Events (when they search for a solution):**
- GST notice or audit scare
- Accountant fee increase
- Business partner/friend showed them a better tool
- Tax season (March, September GSTR deadlines)

---

### Secondary ICP A — "The Growing Restaurateur"

| Attribute | Description |
|-----------|-------------|
| **Industry** | QSR (quick service restaurant), cloud kitchen, cafe |
| **Size** | 5–25 employees, 1–3 locations |
| **Need** | Fast POS billing, multiple payment modes, daily sales summary |
| **Value Prop** | Card mode POS, split payments, audit logs, WhatsApp receipts |

### Secondary ICP B — "The Service Professional"

| Attribute | Description |
|-----------|-------------|
| **Industry** | Freelancer, tuition center, repair shop, salon |
| **Size** | 1–5 employees |
| **Need** | Non-GST billing, customer ledger, simple invoices |
| **Value Prop** | Non-GST billing module, customer management, payment tracking |

### Secondary ICP C — "The Distributor / Wholesaler"

| Attribute | Description |
|-----------|-------------|
| **Industry** | FMCG distributor, stationery wholesale, auto parts |
| **Size** | 10–50 employees, regional |
| **Need** | Multi-user (owner + managers + field staff), stock transfers, bulk billing |
| **Value Prop** | Role-based access, branch management, reports, audit logs |

---

### Anti-ICP (Do NOT Target)

| Segment | Reason |
|---------|--------|
| Enterprise (500+ employees) | Complex needs, long sales cycles, need ERP not billing tool |
| E-commerce only businesses | Need marketplace integrations (Flipkart/Amazon APIs) not in roadmap |
| Chartered Accountants (resellers without end-user context) | High churn, support overhead, low lifetime value |
| Businesses outside India | GST-specific product, regulatory mismatch |
| Businesses doing < ₹5L/year | Low willingness to pay, high support cost relative to revenue |

---

## 3. Top 5 Growth Channels (Prioritized)

### Channel Scoring Matrix

| Channel | Effort (1-5) | Impact (1-5) | Cost | Timeline | Priority |
|---------|-------------|-------------|------|----------|----------|
| Product-Led Growth (PLG) | 3 | 5 | Low | Month 1-3 | #1 |
| WhatsApp Referral Loop | 2 | 4 | Very Low | Month 1-2 | #2 |
| SEO (Google organic) | 4 | 5 | Low | Month 2-6 | #3 |
| YouTube GST Content | 3 | 4 | Medium | Month 2-4 | #4 |
| Offline Partnership | 3 | 3 | Low-Med | Month 3-6 | #5 |

---

### Channel 1: Product-Led Growth (PLG) — Free Trial Optimization

**Tactic:** Convert the 14-day free trial into a self-serve growth engine

**Effort:** 3/5 | **Impact:** 5/5 | **Cost:** ₹0 (engineering time only) | **Timeline:** Month 1-3

**Key Initiatives:**

1. **Instant Value Delivery (< 5 minutes)**
   - Pre-populate demo data (5 products, 3 bills) on first login so users see a working system immediately
   - One-click GST setup wizard: enter GSTIN → auto-fill business name and address via GST API
   - "Your first bill in 2 minutes" interactive walkthrough

2. **Trial Urgency Mechanics**
   - Progress bar showing "You've created X bills — unlock unlimited with Pro"
   - Day 10 popup: "4 days left — your data stays safe when you upgrade"
   - Email at Day 12: "Don't lose your 47 bills and 23 customers — upgrade now"

3. **Freemium Tier (Recommended Addition)**
   - Free forever: up to 50 bills/month, 1 user, basic reports
   - Paid: unlimited bills, multi-user, advanced analytics, custom branding
   - Free tier creates viral network effect via invoice watermarks

4. **In-App Feature Gating**
   - Premium features visibly locked with "Upgrade" tooltip (not hidden)
   - Trigger upgrade modal when user tries to add 2nd team member
   - Show "Pro feature" badge next to analytics charts

**KPI:** Trial-to-paid conversion rate (target: 25%)

---

### Channel 2: WhatsApp / Referral Viral Loop

**Tactic:** Weaponize WhatsApp — India's primary business communication tool

**Effort:** 2/5 | **Impact:** 4/5 | **Cost:** ₹5,000-20,000/month (WhatsApp Business API) | **Timeline:** Month 1-2

**Key Initiatives:**

1. **WhatsApp Bill Sharing (Built-in Virality)**
   - Add "Share on WhatsApp" button on every generated bill
   - Bill PDF footer: "Powered by RYX Billing — ryxbilling.com"
   - Every shared bill = brand impression to the customer receiving it

2. **WhatsApp Onboarding Sequence**
   - Capture phone at signup → opt-in for WhatsApp updates
   - Day 0: "Welcome! Here's how to create your first bill in 2 min [video link]"
   - Day 3: "Quick tip: Add your product catalog once, bill faster forever"
   - Day 7: "You've created X bills! See your week in numbers [dashboard link]"
   - Day 13: "Trial ends tomorrow — here's why 500+ shops chose RYX Pro [link]"

3. **Support via WhatsApp**
   - Existing: +919876543210 support number
   - Add WhatsApp Business API with automated FAQ responses
   - Human escalation for billing/payment issues
   - Response time SLA: < 2 hours (competitive advantage over Tally/Vyapar)

4. **WhatsApp Broadcast for Leads**
   - Partner with CA (Chartered Accountant) networks — they advise 50-200 clients
   - Provide CAs with affiliate link + WhatsApp broadcast template
   - CA earns ₹200/month per active referral (passive income angle)

**KPI:** Referral signups from WhatsApp (target: 30% of new signups from referral)

---

### Channel 3: SEO — GST Billing Software India Keywords

**Tactic:** Own the Google search results for high-intent GST billing queries

**Effort:** 4/5 | **Impact:** 5/5 | **Cost:** ₹15,000-30,000/month (content creation) | **Timeline:** Month 2-6 (compounding)

**Target Keyword Clusters:**

| Cluster | Example Keywords | Monthly Volume | Competition |
|---------|-----------------|----------------|-------------|
| GST billing software | "best gst billing software india", "free gst billing software" | 40,000+ | Medium |
| Competitor alternatives | "vyapar alternative", "tally alternative for small business" | 15,000+ | Medium |
| GST compliance | "how to generate gst invoice", "gst invoice format" | 80,000+ | High |
| Specific businesses | "billing software for restaurant india", "pharmacy billing software gst" | 20,000+ | Low |
| Free tools | "free invoice maker india", "online gst invoice generator" | 50,000+ | Medium |

**SEO Strategy:**

1. **Technical SEO Foundation (Month 1-2)**
   - Landing page speed < 2s on mobile (India's primary browsing device)
   - Schema markup: SoftwareApplication, FAQPage, Organization
   - Hreflang for Hindi content (target bilingual audience)
   - Core Web Vitals: LCP < 2.5s, CLS < 0.1

2. **Content Hub (Month 2-6)**
   - Publish 4 blog posts/month targeting the keyword clusters above
   - Create free tools: "Free GST Invoice Generator" (captures email, shows RYX value)
   - Create comparison pages: "RYX vs Vyapar", "RYX vs Tally"
   - Guest posts on CA (Chartered Accountant) websites and SMB forums

3. **Local SEO**
   - Google My Business listing (even as a SaaS — drives local trust)
   - Target city-specific keywords: "billing software for shops in Surat"

**KPI:** Organic trial signups (target: 40% of signups from organic search by Month 6)

---

### Channel 4: YouTube Content — GST Tutorial Videos

**Tactic:** Educational content that pre-sells RYX Billing to GST-confused small business owners

**Effort:** 3/5 | **Impact:** 4/5 | **Cost:** ₹10,000-25,000/month (video production) | **Timeline:** Month 2-4

**Content Strategy:**

1. **Tutorial Series: "GST for Small Business Owners" (Hindi + English)**
   - Target: Business owners searching "how to do GST" on YouTube
   - Format: 5-10 minute explainers using screen recording + RYX Billing demo
   - CTA: "Download RYX Billing free for 14 days" in description + pinned comment

2. **Product Demo Videos**
   - "How to create GST invoice in 2 minutes with RYX Billing"
   - "Stock management for retail shops — complete walkthrough"
   - "Multi-user billing setup for restaurants"

3. **Shorts Strategy (YouTube Shorts)**
   - 30-60 second tips: "GST invoice mistake #3 that costs you money"
   - High shareability → WhatsApp viral loop
   - Target: 10 Shorts/month

4. **Channel Growth Tactics**
   - Collaborate with CA/tax YouTubers (cross-promotion)
   - Pin top comment on every video: "Free trial link in description"
   - End screen: Subscribe + link to next video in series

**KPI:** YouTube-referred trial signups (target: 15% of signups from YouTube by Month 4)

---

### Channel 5: Partnership / Offline Distribution

**Tactic:** Use trust networks to reach offline SMBs who don't self-discover SaaS

**Effort:** 3/5 | **Impact:** 3/5 | **Cost:** ₹20,000-50,000/month (partner commissions) | **Timeline:** Month 3-6

**Partner Types:**

1. **Chartered Accountants (CAs) — Highest Priority**
   - CAs advise GST-registered clients on compliance software
   - Offer CA Partner Program: 20% recurring commission + client management dashboard
   - Target: 50 active CA partners by Month 6
   - Each CA refers avg 5 clients = 250 customers from 50 CAs

2. **Computer/IT Shops in Tier 2 Cities**
   - Small IT shops install software for local businesses
   - Offer: ₹500 one-time per activated paid customer
   - Target cities: Surat, Jaipur, Ludhiana, Coimbatore, Nashik
   - Provide printed QR code standee for their shop

3. **Industry Associations**
   - CAIT (Confederation of All India Traders) — 80M+ trader members
   - FHRAI (Federation of Hotel & Restaurant Associations of India)
   - Offer: discounted group rates for association members
   - Co-brand educational webinars on GST compliance

4. **Razorpay / Payment Gateway Ecosystem**
   - Already using Razorpay — explore their SMB partner network
   - Razorpay's "Business Suite" page for cross-promotion opportunity
   - Joint webinars: "Accept digital payments + auto-generate GST invoices"

**KPI:** Partner-referred signups (target: 20% of signups from partners by Month 6)

---

## 4. Viral Loop & Referral Program Design

### The Core Viral Loops

```
Loop 1: Invoice Watermark
User creates bill → PDF sent to customer → Customer sees "Powered by RYX Billing"
→ Customer Googles RYX Billing → New signup

Loop 2: Referral Program
User earns reward → Shares with WhatsApp contact (another SMB owner)
→ Contact signs up → Both get rewarded → Contact shares with their network

Loop 3: CA Network
CA recommends RYX to client → Client activates → CA earns commission
→ CA recommends to 5 more clients → Compounding growth
```

---

### Referral Program Mechanics

**Program Name: "Dono Ko Fayda" (Both Benefit)**

| Element | Details |
|---------|---------|
| **Referrer Reward** | 1 month free (₹999 value) OR ₹500 Paytm/UPI cashback per paid activation |
| **Referee Reward** | 1 extra month free trial (21 days instead of 14) OR first month at 50% off |
| **Trigger** | Referral link auto-generated after first bill created (post-activation only) |
| **Sharing Channel** | WhatsApp share button (pre-filled message), copy link |
| **Minimum for Payout** | Referee must activate paid plan (not just sign up) |
| **Max Referrals** | Unlimited (but cap at 12 months free per user to avoid abuse) |

**Pre-filled WhatsApp Referral Message:**
```
Bhai, ek kamaal ka billing app mila! RYX Billing — GST invoice seconds mein
ban jaata hai, stock bhi track hota hai. 14-din free trial hai.
Mere link se join karo to tujhe 21-din milenge FREE:
[REFERRAL_LINK]
```
*(Translation: "Brother, found an amazing billing app! RYX Billing — GST invoice is made in seconds, stock also gets tracked. There's a 14-day free trial. Join from my link and you'll get 21 days FREE.")*

---

### Invoice Watermark Strategy (K-Factor Engine)

**Implementation:**
- Free plan: "Powered by RYX Billing — ryxbilling.com" in PDF footer (non-removable)
- Paid plan: Watermark removable (upgrade incentive) OR optional co-branding
- Design: Subtle, professional — doesn't look like spam

**Viral Coefficient Math:**
- Assumption: Each business sends 30 bills/month to unique customers
- 10% of customers notice and search for RYX Billing
- 5% of those sign up = 1.5 new signups per active user per month
- Target K-factor: **1.2** (each user generates 1.2 new users)

**K-Factor Formula:**
```
K = (avg invites sent per user) × (conversion rate of invites)
K = (30 bills/month × 10% notice rate) × 5% signup rate
K = 3 × 0.05 = 0.15 per month (organic)

Add referral program:
K = 0.15 (organic) + 0.4 (referral sharing) + 0.6 (CA network) = 1.2 ✓
```

---

### Gamification Layer

| Achievement | Reward |
|-------------|--------|
| First bill created | "First Bill" badge + confetti animation |
| 10 bills in first week | Unlock extended trial (+3 days) |
| 3 referrals activated | 1 free month + "Referral Champion" badge |
| 100 bills milestone | Featured as "Power User" (social proof) |
| Team of 3+ | Unlock team leaderboard view |

---

## 5. Onboarding Optimization (Activation)

### The Aha Moment

> **"First GST-compliant bill created, PDF downloaded, and shared with a customer"**

This is the moment the user realizes RYX Billing saves them time and creates professional output. Every onboarding step must drive toward this moment as fast as possible.

---

### 7-Step Activation Checklist

| Step | Action | In-App Element | Time to Complete |
|------|--------|---------------|-----------------|
| 1 | Verify email | Email with magic link | 2 min |
| 2 | Set up business profile (name, GSTIN, address) | GSTIN auto-fill via API | 3 min |
| 3 | Add first product/service | Quick-add modal with category | 2 min |
| 4 | Create first bill | Guided bill creation wizard | 3 min |
| 5 | Download/Preview PDF invoice | One-click download | 1 min |
| 6 | Share bill via WhatsApp | WhatsApp share button | 1 min |
| 7 | Explore dashboard | Auto-redirect after first bill | 1 min |

**Total time to Aha Moment: ~13 minutes**

**Progress Bar UI:**
```
[=====>        ] Step 3 of 7: Add your first product
"You're 43% there! Most users create their first bill in under 15 minutes."
```

---

### Day 1 / Day 3 / Day 7 Email Sequences

#### Day 0 (Immediate — Welcome)
**Subject:** "Welcome to RYX Billing — Your first GST invoice awaits 🎉"
**Content:**
- 3-step quick start (GSTIN → Add product → Create bill)
- Link to 2-min video walkthrough
- WhatsApp support number
- CTA: "Create your first bill now →"

#### Day 1 (24 hours — Activation nudge)
**Subject (activated users):** "Your first bill was perfect — here's what's next"
**Subject (not activated):** "Still setting up? We saved your progress"
**Content (activated):** Feature spotlight — Stock management tip
**Content (not activated):** "Takes only 5 minutes. Most shop owners tell us..."
- Remove friction: offer live chat/WhatsApp help
- CTA: "Resume setup →" (deep link to last incomplete step)

#### Day 3 (Feature discovery)
**Subject:** "Pro tip: Add your entire product catalog in 2 minutes"
**Content:**
- Bulk product import via Excel/CSV
- How auto-calculation of GST saves 30 min/day
- Success story: "How Rajan's hardware shop in Pune cut billing time by 80%"
- CTA: "Explore stock management →"

#### Day 5 (Social proof + urgency)
**Subject:** "500+ Indian shops trust RYX Billing — here's their story"
**Content:**
- Testimonials (restaurant owner, pharmacist, clothing retailer)
- Feature comparison: RYX vs Vyapar vs Tally
- CTA: "See all features →"

#### Day 7 (Retention check)
**Subject:** "Your week in numbers — [X bills, ₹Y revenue tracked]"
**Content:**
- Personalized mini-report from their first week
- "You're saving ~3 hours/week on billing"
- Refer-a-friend prompt
- CTA: "Share RYX with a fellow business owner →"

#### Day 10 (Upgrade prompt)
**Subject:** "4 days left in your free trial — don't lose your data"
**Content:**
- Summary of what they've built (bills, products, customers)
- Side-by-side Free vs Pro feature comparison
- Pricing clarity: "As low as ₹83/day — less than a chai and samosa"
- Early bird: "Upgrade today — get 2 months for the price of 1"
- CTA: "Upgrade now →"

#### Day 13 (Final push)
**Subject:** "Tomorrow is your last day — [First Name], don't let this go"
**Content:**
- Loss aversion: "Your 47 bills, 23 customers, and 89 products stay with you when you upgrade"
- Testimonial + one-click upgrade
- Alternative: "Keep the free plan with limited features"
- CTA: "Upgrade before midnight →"

---

### In-App Nudges

| Trigger | Nudge | Placement |
|---------|-------|-----------|
| User idle for 5 min on empty dashboard | "Your dashboard is waiting — create your first bill" | Full-screen overlay |
| Tries to add 2nd user | "Team features require Pro — unlock for ₹83/day" | Inline modal |
| Creates 10th bill | "You're on a roll! Export your sales report" | Toast notification |
| Views analytics first time | "This data updates every time you create a bill" | Tooltip |
| Day 8 without creating a bill | "Back already? Your last bill was [date]" | Header banner |
| Downloads PDF | "Share this with your customer on WhatsApp" | Post-download prompt |

---

## 6. Retention Playbook

### Retention Cohort Targets

| Cohort | Current | Month 3 Target | Month 6 Target |
|--------|---------|----------------|----------------|
| Day 7 Retention | 50% | 65% | 75% |
| Day 30 Retention | 40% | 55% | 65% |
| Day 90 Retention | 25% | 40% | 55% |
| 12-Month Retention | 15% | 30% | 45% |

---

### Day 7 Retention Tactics

1. **Weekly Usage Summary Email**
   - Auto-send every Monday: "Last week: X bills, ₹Y revenue, Z new customers"
   - Makes users feel the product is valuable even if they haven't logged in

2. **Feature of the Week**
   - In-app spotlight card highlighting one unused feature
   - "Did you know? You can track stock levels automatically"

3. **GST Compliance Reminder**
   - "Your GSTR-1 filing is due in 18 days — your data is ready"
   - Turns RYX into a compliance tool, not just billing

---

### Day 30 Retention Tactics

1. **Monthly Business Review (MBR) Email**
   - Auto-generated: "Your month in numbers — [Month] 2026"
   - Top-selling products, peak billing hours, revenue trend
   - "Share this report with your accountant"

2. **Accountant/CA Integration Pitch**
   - "Send your GST reports directly to your CA in one click"
   - Positions RYX as essential accounting infrastructure

3. **Power User Campaign**
   - Identify users with >50 bills/month → reach out personally (WhatsApp/email)
   - Offer: Feature preview / beta access / testimonial feature
   - Goal: Turn power users into advocates

4. **Feature Adoption Check**
   - Users not using Stock module: "Your billing data can auto-update stock levels"
   - Users not using Customer module: "Track which customers owe you money"
   - Trigger: In-app banner + email for each unused key feature

---

### Day 90 Retention Tactics

1. **Annual Plan Pitch (Lock-in)**
   - "Save ₹2,000/year with Annual Pro — pay for 10 months, get 12"
   - Offer at Day 60, Day 90, and renewal reminder
   - Reduces churn by 60% (annual vs monthly)

2. **Milestone Celebrations**
   - "You've created 500 bills with RYX! Here's your 3-month badge"
   - WhatsApp or in-app milestone notification
   - Shareable "I've processed ₹10L in invoices" card for social media

3. **Product Roadmap Transparency**
   - Quarterly email: "What's coming in RYX Billing Q2 2026"
   - Invite power users to vote on features (Canny/Featurebase board)
   - Users invested in roadmap churn 40% less

---

### Re-Engagement for Churned Trials

**Segment: Signed up but never activated (no bill created)**
- Wait 3 days after trial ends
- Email: "Your RYX account is waiting — what got in the way?"
- 1-question survey: "What stopped you? [Too complex / Needed different features / Just testing / Went with competitor]"
- Based on response, send targeted re-engagement

**Segment: Activated but didn't convert to paid**
- Wait 7 days after trial ends
- WhatsApp: "Still need GST billing? Your data is preserved for 30 days. Come back with 50% off"
- Offer: 50% first month discount (time-limited: 48 hours)

**Segment: Was paying, then churned**
- Personal outreach from founder/team (WhatsApp message, not automated)
- Understand reason: price, features, competitor, business closed
- Offer: 2 months free if they return within 30 days

---

## 7. Content Marketing Plan

### 10 SEO Blog Posts (Targeting Indian SMB Keywords)

| # | Title | Target Keyword | Monthly Searches | Intent |
|---|-------|---------------|-----------------|--------|
| 1 | "How to Create a GST Invoice in India: Step-by-Step Guide (2026)" | how to create gst invoice | 22,000 | Informational |
| 2 | "Best GST Billing Software for Small Business in India (Free + Paid)" | best gst billing software india | 18,000 | Commercial |
| 3 | "Vyapar vs Tally vs RYX Billing: Which is Best for Your Shop?" | vyapar vs tally | 8,000 | Commercial |
| 4 | "Free GST Invoice Format in Excel, Word, and PDF (Download Now)" | gst invoice format free download | 35,000 | Informational |
| 5 | "GST Billing Software for Restaurants: Complete Guide for Indian F&B Owners" | billing software for restaurants india | 5,000 | Commercial |
| 6 | "How to File GSTR-1 Without an Accountant: Billing Software That Prepares Your Data" | gstr-1 filing small business | 12,000 | Informational |
| 7 | "Stock Management Software for Retail Shops in India (2026 Guide)" | stock management software retail india | 7,000 | Commercial |
| 8 | "10 Signs Your Business Needs to Switch from Manual Billing to GST Software" | manual billing to gst software | 3,000 | Awareness |
| 9 | "How Kirana Stores and Small Shops Can Manage GST Compliance Easily" | gst compliance kirana store | 4,500 | Informational |
| 10 | "RYX Billing Review 2026: Is It the Best Free GST Billing Software?" | ryx billing review | 500 (brand) | Brand |

**Content Production Schedule:** 2-3 posts/month, 1,500-2,500 words each, Hindi + English versions of top 5

---

### 5 YouTube Video Ideas

| # | Title | Format | Target Viewer | Duration |
|---|-------|--------|--------------|----------|
| 1 | "GST Invoice Banao 2 Minutes Mein — RYX Billing Tutorial Hindi" (Create GST invoice in 2 minutes) | Screen record + voiceover | Hindi-speaking shop owners | 6 min |
| 2 | "Vyapar vs RYX Billing — Konsa Behtar Hai? Honest Comparison 2026" (Which is better? Honest comparison) | Side-by-side comparison | Vyapar users considering switch | 10 min |
| 3 | "Restaurant Billing System Setup — From Zero to First Bill in 10 Minutes" | Tutorial + demo | Restaurant/cafe owners | 12 min |
| 4 | "GSTR-1 Filing ke liye Data kaise Prepare karo — Bina CA ke!" (How to prepare data for GSTR-1 — Without a CA!) | Tutorial | GST-confused small business owners | 8 min |
| 5 | "Apni Dukaan ka Stock Mobile Se Track Karo — Free Billing Software" (Track your shop's stock from mobile — Free billing software) | Tutorial | Retail shop owners | 7 min |

**Production Tips:**
- Record in Hindi for primary audience (higher search volume, less competition)
- Upload Hindi subtitles + English captions (doubles audience)
- Thumbnail: Bold Hindi text + smiling shop owner + RYX logo
- Post schedule: 2 videos/month (quality over quantity)

---

### WhatsApp Broadcast Templates

**Template 1: Feature Announcement**
```
🆕 *RYX Billing Update Alert!*

Ab aap apne customers ko directly WhatsApp pe bill bhej sakte ho!

✅ Bill banao
✅ WhatsApp karo
✅ Payment pao

14-din free trial: ryxbilling.com

[Unsubscribe: reply STOP]
```

**Template 2: GST Compliance Reminder**
```
📅 *GST Filing Reminder*

Kal hai GSTR-1 filing ka last date!

RYX Billing use karte ho? Aapka data ready hai. Ek click mein CA ko bhejo.

Abhi nahi use karte? Free trial start karo:
ryxbilling.com/trial

Koi sawal? Reply karo ya call karo: +919876543210
```

**Template 3: Social Proof / Testimonial**
```
⭐ *Rajan Hardware Store, Pune ne likha:*

"Pehle billing mein 2 ghante lagte the. Ab 20 minute mein sab ho jaata hai. GST return bhi accountant ke bina file kar leta hoon."

Aap bhi try karo — 14 din bilkul free:
ryxbilling.com

📞 Help chahiye? +919876543210
```

**Template 4: Referral Program**
```
💰 *Dono Ko Fayda Program!*

Apne kisi dost/business partner ko RYX Billing recommend karo:

👉 Unhe milega: 21 din FREE trial
👉 Tumhe milega: 1 month FREE (₹999 value)

Apna referral link generate karo:
ryxbilling.com/refer

*Sirf limited time ke liye!*
```

---

## 8. Experiment Backlog (10 Experiments)

### Experiment Scoring: ICE Framework
- **Impact** (1-10): How much will it move the NSM?
- **Confidence** (1-10): How sure are we it will work?
- **Ease** (1-10): How easy to implement?
- **ICE Score** = Impact × Confidence × Ease

| # | Experiment | Metric | ICE | Duration |
|---|-----------|--------|-----|----------|
| 1 | GSTIN Auto-Fill at Signup | Activation Rate | 8×8×9=576 | 2 weeks |
| 2 | Free Forever Tier | Trial Signups | 9×7×6=378 | 4 weeks |
| 3 | WhatsApp Onboarding vs Email | D7 Retention | 8×7×7=392 | 3 weeks |
| 4 | Demo Data Pre-population | D1 Activation | 9×8×8=576 | 1 week |
| 5 | Annual Plan at Trial End | Trial-to-Paid | 8×7×8=448 | 2 weeks |
| 6 | Referral Prompt After Aha Moment | K-factor | 7×6×9=378 | 1 week |
| 7 | Hindi UI Toggle | Signup Rate (Tier 2) | 7×6×5=210 | 6 weeks |
| 8 | Invoice Watermark A/B Test | Organic Signups | 8×7×7=392 | 4 weeks |
| 9 | Live Chat Widget (Tawk.to) | Trial Conversion | 7×7×9=441 | 1 week |
| 10 | Exit Intent Popup (50% Discount) | Churn Reduction | 7×6×8=336 | 1 week |

---

### Detailed Experiment Specs

**Experiment 1: GSTIN Auto-Fill at Signup**
- **Hypothesis:** If we auto-fill business name and address from GSTIN during signup, activation rate will increase by 15% because we reduce manual data entry friction
- **Metric:** % of signups who complete business setup (Step 2 completion rate)
- **Control:** Manual form fields | **Variant:** GSTIN field → auto-populate name/address
- **Duration:** 2 weeks
- **Success Criteria:** >15% lift in Step 2 completion rate, p < 0.05
- **Cost:** ₹2,000/month for GST API access

**Experiment 2: Free Forever Tier**
- **Hypothesis:** If we offer a free tier (50 bills/month, 1 user), signup volume will increase 3x because we remove the commitment barrier for price-sensitive SMBs, and watermark virality will grow organically
- **Metric:** Monthly new signups, watermark-driven signups, trial-to-paid rate
- **Control:** 14-day trial only | **Variant:** Free forever + 14-day Pro trial
- **Duration:** 4 weeks (measure signup volume + 60-day conversion rate)
- **Success Criteria:** >2x signup volume, >15% free-to-paid conversion within 90 days
- **Risk:** Support volume increase, abuse potential

**Experiment 3: WhatsApp Onboarding vs Email**
- **Hypothesis:** If we send onboarding via WhatsApp (opt-in), Day-7 retention will increase by 20% vs email-only because WhatsApp has 90%+ open rate vs email's 25%
- **Metric:** D7 retention rate (control: email only, variant: WhatsApp + email)
- **Duration:** 3 weeks (measure D7 cohort)
- **Success Criteria:** >15% lift in D7 retention
- **Cost:** WhatsApp Business API: ₹0.28/message

**Experiment 4: Demo Data Pre-population**
- **Hypothesis:** If new users see a pre-populated dashboard with sample bills/products/customers on first login, Day-1 activation will increase by 25% because they experience the product value without the blank-slate problem
- **Metric:** % of users who create a real bill within 24 hours of signup
- **Duration:** 1 week
- **Success Criteria:** >20% lift in Day-1 activation rate

**Experiment 5: Annual Plan Pitch at Trial End**
- **Hypothesis:** If we show an annual plan option prominently at Day 12 (trial expiry), revenue per converted user will increase 8× (vs monthly) because committed users prefer paying less overall
- **Metric:** Revenue per converted trial user, 90-day retention of annual vs monthly
- **Duration:** 2 weeks
- **Success Criteria:** >30% of converters choose annual plan

**Experiment 6: Referral Prompt After Aha Moment**
- **Hypothesis:** If we show the referral prompt immediately after the user's first bill is created (Aha Moment), referral share rate will increase 3x vs showing it in settings because motivation is highest right after perceived value
- **Metric:** Referral link shares per activated user
- **Duration:** 1 week (run permanently if successful)
- **Success Criteria:** >2x referral link share rate

**Experiment 7: Hindi UI Toggle**
- **Hypothesis:** If we add a Hindi language option to the UI, signups from Tier 2 cities (Jaipur, Lucknow, Surat, Indore) will increase by 40% because language is the #1 friction for non-English-comfortable business owners
- **Metric:** Signups and activation rates segmented by city
- **Duration:** 6 weeks (implementation + measurement)
- **Success Criteria:** >30% lift in Tier 2 city signups

**Experiment 8: Invoice Watermark A/B Test**
- **Hypothesis:** If free-plan invoice PDFs include "Powered by RYX Billing — ryxbilling.com", organic signups from customers who receive these invoices will increase by 20% as measured by "How did you hear about us?" attribution
- **Metric:** Watermark-attributed signups (via URL tracking + survey)
- **Duration:** 4 weeks
- **Success Criteria:** >10 signups/week attributed to watermark

**Experiment 9: Live Chat Widget**
- **Hypothesis:** If we add a live chat widget (Tawk.to — free) to the pricing and trial pages, trial-to-paid conversion will increase by 10% because hesitant buyers get instant answers to purchase-blocking questions
- **Metric:** Trial-to-paid conversion rate (pages with vs without chat)
- **Duration:** 1 week
- **Success Criteria:** >8% lift in conversion rate on pages with chat
- **Cost:** Free (Tawk.to)

**Experiment 10: Exit Intent Popup (50% Discount)**
- **Hypothesis:** If we show a 50% first-month discount popup when a trial user shows exit intent on the pricing/upgrade page, churn reduction will offset the revenue discount within 60 days
- **Metric:** Conversion rate on upgrade page, CAC for exit-intent conversions
- **Duration:** 1 week
- **Success Criteria:** >15% conversion on exit intent, LTV:CAC > 3

---

## 9. 90-Day Sprint Plan

### Week 1-4: Foundation — "Fix the Leaky Bucket"

**Goal:** Stop losing the leads you're already getting. Fix activation and onboarding.

| Week | Priority | Task | Owner | KPI |
|------|----------|------|-------|-----|
| Week 1 | Activation | Implement GSTIN auto-fill at signup | Engineering | Step-2 completion rate |
| Week 1 | Activation | Add 7-step progress bar to onboarding | Engineering | Onboarding completion % |
| Week 1 | Analytics | Set up Mixpanel/PostHog funnel tracking | Engineering | Funnel visibility |
| Week 2 | Retention | Set up Day 0/1/3/7/10/13 email sequences in Brevo/Mailchimp | Marketing | Open rate, CTA clicks |
| Week 2 | Viral | Add "Share via WhatsApp" button to bill PDF page | Engineering | Shares/bill |
| Week 2 | Viral | Implement invoice watermark for free users | Engineering | Watermark-attributed signups |
| Week 3 | Retention | Pre-populate demo data for new signups | Engineering | D1 activation rate |
| Week 3 | Referral | Build referral link generator (post-Aha Moment trigger) | Engineering | Referral shares |
| Week 4 | Channel | Publish first 2 SEO blog posts | Marketing | Organic traffic |
| Week 4 | WhatsApp | Set up WhatsApp Business API onboarding flow | Marketing | WhatsApp opt-in rate |

**Week 4 Milestone:** Activation rate > 45%, email sequences live, tracking in place

---

### Week 5-8: Traction — "Turn On the Traffic"

**Goal:** Drive qualified new signups across multiple channels simultaneously.

| Week | Priority | Task | Owner | KPI |
|------|----------|------|-------|-----|
| Week 5 | SEO | Publish 2 more blog posts + SEO audit | Marketing | Keyword rankings |
| Week 5 | YouTube | Record and upload first 2 tutorial videos | Marketing | Views, CTR to signup |
| Week 5 | WhatsApp | Launch "Dono Ko Fayda" referral program | Marketing | Referrals sent |
| Week 6 | PLG | Run Experiment 5: Annual plan at trial end | Growth | Annual plan conversion % |
| Week 6 | Partnership | Contact first 10 CA firms for partner program | Sales | CA partners signed |
| Week 6 | SEO | Create free "GST Invoice Generator" tool (lead magnet) | Engineering/Marketing | Tool users, email captures |
| Week 7 | WhatsApp | First WhatsApp broadcast to opted-in users | Marketing | Open rate, click rate |
| Week 7 | YouTube | Record 2 more videos (Hindi tutorial series) | Marketing | Subscriber growth |
| Week 8 | PLG | Run Experiment 9: Live chat on pricing page | Growth | Conversion lift |
| Week 8 | Analytics | Mid-sprint review: kill underperforming experiments | All | ICE score re-evaluation |

**Week 8 Milestone:** 500+ monthly signups, 3 channels contributing, first 5 CA partners

---

### Week 9-12: Scale — "Double Down on What Works"

**Goal:** Scale the channels and experiments that showed positive results in Weeks 5-8.

| Week | Priority | Task | Owner | KPI |
|------|----------|------|-------|-----|
| Week 9 | PLG | Launch Experiment 2: Free forever tier (if approved) | Product/Engineering | Signup volume |
| Week 9 | SEO | Publish comparison pages (RYX vs Vyapar, RYX vs Tally) | Marketing | Organic traffic from competitor searches |
| Week 10 | Partnership | Scale CA partner program to 25 partners | Sales | Partner-referred signups |
| Week 10 | YouTube | Collab with 2 CA/SMB YouTubers | Marketing | Cross-promotion signups |
| Week 11 | Retention | Launch monthly business review email (auto-generated) | Engineering/Marketing | D30 retention lift |
| Week 11 | Revenue | Run annual plan campaign to all monthly subscribers | Marketing | Annual upgrade rate |
| Week 12 | Scale | Double SEO content production (4 posts/month) | Marketing | Organic traffic |
| Week 12 | Review | Full 90-day retrospective: channels, experiments, metrics | All | MRR, signups, CAC, LTV |

**Week 12 Milestone:** MRR ≥ ₹5L, 1,000 monthly signups, K-factor ≥ 1.0

---

### 90-Day Resource Requirements

| Resource | Monthly Budget | Purpose |
|----------|---------------|---------|
| WhatsApp Business API | ₹5,000-15,000 | Onboarding + broadcast messages |
| Content creation (blog) | ₹10,000-20,000 | 4 SEO posts/month (writer + editor) |
| Video production | ₹10,000-20,000 | 2 YouTube videos/month |
| SEO tools (Ahrefs/SEMrush) | ₹8,000 | Keyword research, rank tracking |
| Email tool (Brevo) | ₹3,000 | Email sequences + broadcast |
| Analytics (PostHog) | ₹0-5,000 | Free tier sufficient initially |
| CA partner commissions | ₹5,000-20,000 | 20% of referred MRR |
| **Total** | **₹41,000-88,000/month** | Growth budget for 90-day sprint |

---

## 10. Key Metrics Dashboard

### Daily Metrics (Check Every Morning)

| Metric | Formula | Target | Alert Threshold |
|--------|---------|--------|-----------------|
| New Trial Signups | Signups today | >33/day (1K/month) | <15/day |
| Day-1 Activation Rate | Users who created a bill today / signups 1 day ago | >65% | <40% |
| Bills Created Today | Total bills across all tenants | Growing WoW | Flat for 3+ days |
| Paid Conversions Today | New paying customers | >3/day | 0 for 2+ days |
| Churn Today | Cancellations | <2/day | >5/day |

---

### Weekly Metrics (Review Every Monday)

| Metric | Formula | Benchmark | Action if Below |
|--------|---------|-----------|-----------------|
| Weekly Trial Signups | Sum of 7-day signups | 250/week | Investigate traffic sources |
| Activation Rate (D2) | % created bill within 48h | >60% | Review onboarding flow |
| Trial-to-Paid Conversion | Paid this week / trials started 14 days ago | >25% | Upgrade email A/B test |
| Referral Rate | New signups from referral / total signups | >30% | Push referral program |
| WhatsApp Open Rate | Messages opened / sent | >70% | Review message templates |
| NPS Score (weekly survey) | Promoters% - Detractors% | >50 | Flag for customer success |

---

### Monthly Metrics (Board/Investor Level)

| Metric | Formula | Month 3 Target | Month 6 Target | Month 12 Target |
|--------|---------|----------------|----------------|-----------------|
| MRR | Sum of all active subscription revenue | ₹5L | ₹12L | ₹20L |
| MRR Growth Rate | (MRR this month / last month) - 1 | 25%+ MoM | 20%+ MoM | 15%+ MoM |
| Paying Customers | Active paid subscribers | 200 | 500 | 2,000 |
| CAC (Customer Acquisition Cost) | Total marketing spend / new paid customers | <₹500 | <₹400 | <₹300 |
| LTV (Lifetime Value) | ARPU × avg months retained | >₹5,000 | >₹7,000 | >₹10,000 |
| LTV:CAC Ratio | LTV / CAC | >10 | >15 | >25 |
| Churn Rate (Monthly) | Cancelled / start of month paying | <5% | <4% | <3% |
| Net Revenue Retention | MRR from existing customers (expansions - churn) | >90% | >95% | >110% |
| K-factor (Viral Coefficient) | New signups from referral / total paid users | 0.6 | 0.9 | 1.2 |
| Payback Period | CAC / (ARPU × gross margin) | <6 months | <4 months | <3 months |

---

### Competitive Benchmarks (Indian SaaS)

| Metric | RYX Target (Month 12) | Vyapar (est.) | Zoho Books (est.) |
|--------|----------------------|--------------|------------------|
| Trial-to-Paid | 25% | 15-20% | 20-25% |
| Monthly Churn | <3% | 8-10% | 5-7% |
| LTV | ₹10,000+ | ₹5,000-8,000 | ₹15,000+ |
| NPS | 60+ | 30-40 | 40-50 |
| CAC | <₹300 | ₹500-800 | ₹1,000+ |

**RYX Competitive Edge to Maintain:**
- Faster onboarding (Aha Moment in <15 min vs 60+ min for Tally)
- WhatsApp-first support (vs ticket-only for Vyapar/Zoho)
- Price advantage at entry tier
- Modern React UI vs legacy Electron/desktop apps

---

## Appendix: Quick Reference

### Critical Thresholds (Do Not Cross)

| Metric | Red Line | Action Required |
|--------|----------|-----------------|
| Day-2 Activation Rate | <30% | Immediate onboarding redesign |
| Trial-to-Paid Conversion | <10% | Product-market fit review |
| Monthly Churn | >8% | Customer success intervention |
| CAC:LTV Ratio | <3× | Pause paid acquisition |
| Support Response Time | >4 hours (WhatsApp) | Hire support staff |

### The 3 Most Important Things (Every Quarter)

1. **Activation beats acquisition** — Fixing activation rate gives 3× more ROI than increasing signups
2. **Referral is the cheapest channel** — K-factor >1.0 = self-sustaining growth, free
3. **Annual plans beat monthly** — Annual subscribers churn 70% less; push them from Day 1

---

*Document Owner: Growth Team*
*Next Review Date: 2026-06-17 (90-day review)*
*Related Documents: `docs/superpowers/plans/2026-03-17-security-hardening.md`*
