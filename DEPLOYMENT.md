# Railway Deployment Guide

## Environment Variables Required

Set these environment variables in your Railway project settings:

### Required:
- `DB_URL` - Database connection string (PostgreSQL recommended)
- `JWT_SECRET` - Secret key for JWT tokens
- `SECRET_KEY` - Flask secret key

### Optional:
- `SUPABASE_URL` - Supabase project URL (if using Supabase)
- `SUPABASE_KEY` - Supabase API key (if using Supabase)
- `DEBUG` - Set to `False` for production
- `CORS_ORIGINS` - Comma-separated list of allowed origins

## Example Environment Variables:

```
DB_URL=postgresql://username:password@host:port/database
JWT_SECRET=your-secure-jwt-secret-key
SECRET_KEY=your-secure-flask-secret-key
DEBUG=False
CORS_ORIGINS=https://your-frontend-domain.com
```

## Deployment Steps:

1. Push code to your repository
2. Connect Railway to your repository
3. Set environment variables in Railway dashboard
4. Railway will automatically deploy using the Dockerfile

## Health Check:

Once deployed, check: `https://your-app.railway.app/api/health`

Should return: `{"status": "healthy", "message": "RYX Billing API is running"}`
