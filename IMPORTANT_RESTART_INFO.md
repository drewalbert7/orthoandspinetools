# ⚠️ IMPORTANT: How to Restart Services Safely

## 🚨 CRITICAL RULE
**NEVER use `docker-compose down` without first backing up the database!**

## ✅ Safe Restart (Use This!)

```bash
# Option 1: Use the quick restart script
./scripts/quick-restart.sh

# Option 2: Restart individual services
docker restart orthoandspinetools-postgres orthoandspinetools-backend orthoandspinetools-frontend
```

## ❌ DON'T DO THIS
```bash
# This will break login/auth:
docker-compose down
docker-compose up -d
```

## Why?
When containers are recreated, there can be password mismatches between:
- PostgreSQL `POSTGRES_PASSWORD` in server `.env`
- Backend `DATABASE_URL` (must use the same password)

See `docs/DATABASE_RECOVERY.md` for full recovery steps if something breaks.

## Current Working Configuration

**Database**: `orthoandspinetools`  
**User**: `postgres`  
**Password**: from server `.env` (`POSTGRES_PASSWORD`)  
**Volume**: `orthoandspinetools-main_postgres_data` (persistent)

## Quick Health Check

```bash
# Check if services are running
docker ps | grep orthoandspinetools

# Check backend logs
docker logs orthoandspinetools-backend --tail 20

# Test login
curl -k -X POST https://orthoandspinetools.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your_password"}'
```

## After a Restart

Always verify:
1. ✅ PostgreSQL is running
2. ✅ Backend connects to database
3. ✅ Frontend serves latest build
4. ✅ Login works from website

