# How to Get the Correct Supabase Connection String

## THE PROBLEM:
Your current connection uses `db.habjhxjutlgnjwjbpkvl.supabase.co` which ONLY has IPv6.
Render's free tier does NOT support IPv6, so connection fails.

## THE SOLUTION:
Use Supabase's **Transaction Pooler** or **Session Pooler** which supports IPv4.

## STEPS TO FIX:

### 1. Go to Supabase Dashboard
- Open: https://supabase.com/dashboard/project/habjhxjutlgnjwjbpkvl
- Login if needed

### 2. Get Database Settings
- Click on **"Database"** in the left sidebar (or **"Project Settings" → "Database"**)
- Scroll to **"Connection string"** section

### 3. Select the RIGHT Connection Mode
You will see multiple connection options:

#### OPTION 1: Connection Pooling (RECOMMENDED) ✅
Look for **"Connection Pooling"** or **"Transaction"** mode:
```
postgresql://postgres.habjhxjutlgnjwjbpkvl:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```
- Port: **6543** (Transaction mode)
- OR Port: **5432** (Session mode)
- Host: `aws-0-ap-south-1.pooler.supabase.com` or similar

#### OPTION 2: Direct Connection (DON'T USE) ❌
```
postgresql://postgres:[YOUR-PASSWORD]@db.habjhxjutlgnjwjbpkvl.supabase.co:5432/postgres
```
- This is what you have now (IPv6 only)
- Don't use this!

### 4. Copy the Connection String
- Select **"Transaction"** or **"Session"** mode
- Click **"Copy"** or manually copy the URI
- Replace `[YOUR-PASSWORD]` with: `Ryx@2025` (URL-encoded: `Ryx%402025`)

### 5. Expected Format:
```
postgresql://postgres.habjhxjutlgnjwjbpkvl:Ryx%402025@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

### 6. Update Environment Variable in Render:
- Go to Render Dashboard: https://dashboard.render.com
- Select your backend service: `ryx-billing-backend`
- Click **"Environment"** tab
- Find `DB_URL` variable
- Replace with the NEW connection string from Step 5
- Click **"Save Changes"**
- Render will auto-redeploy

## ALTERNATIVE: Enable IPv4 in Supabase

If pooler doesn't work, you can also:
1. Go to Supabase Dashboard → Database → Settings
2. Enable **"IPv4 Add-on"** (may require paid plan)
3. Use direct connection with IPv4 address

## WHAT TO SEND ME:

After you get the connection string, just tell me:
"I updated DB_URL in Render dashboard"

Then I'll verify it works!
