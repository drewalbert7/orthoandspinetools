# Database Recovery Guide

## Critical Information

### Current Working Configuration
- **Database Container**: `orthoandspinetools-postgres`
- **Database Name**: `orthoandspinetools`
- **Database User**: `postgres`
- **Database Password**: `secure_password_123`
- **Volume**: `orthoandspinetools-main_postgres_data`

### How We Fixed the Login Issue

When containers are recreated, the database volume is preserved BUT the password authentication needs to match:
1. PostgreSQL environment variable: `POSTGRES_PASSWORD=secure_password_123`
2. Backend DATABASE_URL: `postgresql://postgres:secure_password_123@postgres:5432/orthoandspinetools`

## Prevention Steps

### 1. NEVER Use `docker-compose down` Without Backup
The `docker-compose down` command stops ALL containers including PostgreSQL. While data is in a persistent volume, it's safer to:
```bash
# Instead of: docker-compose down
# Use: docker-compose restart [service]
docker-compose restart backend
docker-compose restart frontend
```

### 2. Always Preserve Volumes
The `postgres_data` volume must be preserved. Check it exists:
```bash
docker volume ls | grep postgres_data
```

### 3. If Containers Are Recreated
If you must recreate containers, ensure:
1. The volume persists: `docker volume inspect orthoandspinetools-main_postgres_data`
2. The DATABASE_URL in backend matches the POSTGRES_PASSWORD
3. Restart in order: postgres → backend → frontend

### 4. Password Consistency
Always ensure these match:
- `docker-compose.prod.yml`: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secure_password_123}`
- Backend `DATABASE_URL` environment: `postgresql://postgres:secure_password_123@postgres:5432/orthoandspinetools`

## Recovery Steps

If login is broken:

1. **Check Database Connection**:
```bash
docker exec orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -c "SELECT 1;"
```

2. **Check Password**:
```bash
# Check PostgreSQL environment
docker exec orthoandspinetools-postgres env | grep POSTGRES_PASSWORD

# Check backend environment
docker exec orthoandspinetools-backend env | grep DATABASE_URL
```

3. **Fix Password Mismatch**:
If passwords don't match, update PostgreSQL:
```bash
docker exec orthoandspinetools-postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'secure_password_123';"
```

4. **Restart Backend**:
```bash
docker restart orthoandspinetools-backend
```

5. **Test Login**:
```bash
curl -k -X POST https://orthoandspinetools.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"drewalbert7@gmail.com","password":"your_password"}'
```

## Current Working State

- ✅ **PostgreSQL**: Running with password `secure_password_123`
- ✅ **Backend**: Connected to database successfully
- ✅ **Frontend**: Latest build (`index-BvALbCmE.js`) with PostAttachments fixes
- ✅ **Nginx**: Routing correctly

## Critical Files

- `docker-compose.prod.yml`: Production configuration
- `backend/src/routes/posts.ts`: Feed endpoint with attachments (line 245-304)
- `frontend/src/components/PostAttachments.tsx`: Image/video display component

## Commands Reference

### Safe Restart (Recommended)
```bash
# Restart individual services without recreating containers
docker restart orthoandspinetools-postgres orthoandspinetools-backend orthoandspinetools-frontend
```

### Check Service Health
```bash
docker ps
docker logs orthoandspinetools-backend --tail 20
docker logs orthoandspinetools-frontend --tail 20
```

### Verify Database
```bash
# List all users
docker exec orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -c "SELECT email, username FROM users;"

# Check database size
docker exec orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -c "SELECT pg_size_pretty(pg_database_size('orthoandspinetools'));"
```

## Last Known Good State

**Date**: October 27, 2025  
**Containers**:
- Frontend: `index-BvALbCmE.js` (358,032 bytes)
- Backend: Rebuilt with Prisma client
- Database: Volume `orthoandspinetools-main_postgres_data`

**Features Working**:
- ✅ User login/registration
- ✅ Image/video display on all pages (Home, Popular, Profile, Community)
- ✅ PostAttachments component using object-contain (no cropping)
- ✅ Feed endpoint includes attachments for logged-in users

