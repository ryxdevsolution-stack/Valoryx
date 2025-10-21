# Railway Deployment Guide

## Environment Variables Required

Set these environment variables in your Railway project settings:

### Required for Full Functionality:
- `DB_URL` - Supabase PostgreSQL connection string
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase API key (anon/public key)
- `JWT_SECRET` - Secret key for JWT tokens
- `SECRET_KEY` - Flask secret key

### Optional:
- `DEBUG` - Set to `False` for production
- `CORS_ORIGINS` - Comma-separated list of allowed origins

## Getting Supabase Credentials:

1. Go to [supabase.com](https://supabase.com) and create/login to your project
2. Go to Settings → API
3. Copy your **Project URL** (SUPABASE_URL)
4. Copy your **anon/public** key (SUPABASE_KEY)
5. Go to Settings → Database
6. Copy your **Connection string** (DB_URL)

## Railway Environment Variables Setup:

1. Go to your Railway project dashboard
2. Click on your service
3. Go to the **Variables** tab
4. Add these variables:

```
DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=your-secure-jwt-secret-key-change-this
SECRET_KEY=your-secure-flask-secret-key-change-this
DEBUG=False
CORS_ORIGINS=https://your-frontend-domain.com
```

## Deployment Steps:

1. Push code to your repository
2. Connect Railway to your repository
3. Set environment variables in Railway dashboard (Variables tab)
4. Railway will automatically deploy using the Dockerfile

## Testing Your Deployment:

### Health Check (Basic):
`https://your-app.railway.app/api/health`
Should return: `{"status": "healthy", "message": "RYX Billing API is running"}`

### Status Check (Detailed):
`https://your-app.railway.app/api/status`
Should return detailed configuration status including:
- Database connection status
- Supabase configuration status
- Missing environment variables
- Warnings and recommendations

## Troubleshooting:

### If the app shows "Application failed to respond":
1. Check Railway deployment logs
2. Visit `/api/status` endpoint to see configuration details
3. Verify all environment variables are set correctly
4. Check that Supabase credentials are valid

### Common Issues:
- **Missing SUPABASE_URL/SUPABASE_KEY**: App will use SQLite fallback
- **Invalid DB_URL**: Database connection will fail
- **Missing JWT_SECRET/SECRET_KEY**: Using default values (change for production)

The app is designed to start even with missing configurations and will show helpful error messages via the `/api/status` endpoint.
