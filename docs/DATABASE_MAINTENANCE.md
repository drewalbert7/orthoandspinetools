# Database Maintenance Guide

This guide explains how to maintain, backup, and restore the OrthoAndSpineTools database to prevent data loss.

## Quick Reference

```bash
# Create a backup
./scripts/database-backup-production.sh

# Restore from backup
./scripts/database-restore.sh

# Fix connection issues
./scripts/database-ensure-connection.sh

# Setup automatic backups (daily at 2 AM)
./scripts/setup-automated-backups.sh setup
```

## Automatic Backups

### Setup
Automated backups run daily at 2 AM and keep 7 days of backups:

```bash
./scripts/setup-automated-backups.sh setup
```

### Status
Check if automatic backups are enabled:

```bash
./scripts/setup-automated-backups.sh show
```

### Disable
To disable automatic backups:

```bash
./scripts/setup-automated-backups.sh remove
```

## Manual Backups

Create a manual backup anytime:

```bash
./scripts/database-backup-production.sh
```

Backups are saved to: `/home/dstrad/orthoandspinetools-main/backups/`

## Restore Database

### Interactive Mode
Lists available backups and lets you choose:

```bash
./scripts/database-restore.sh
```

### Direct Mode
Restore a specific backup:

```bash
./scripts/database-restore.sh backup_20251026_020210.sql.gz
```

### What Happens
1. Lists available backups
2. Verifies backup integrity
3. Extracts and restores to database
4. Restarts backend to refresh connections
5. Tests API to confirm restoration

## Fix Connection Issues

If the backend can't connect to the database:

```bash
./scripts/database-ensure-connection.sh
```

This script:
1. Checks PostgreSQL container is running
2. Ensures database password is correct
3. Tests database connection
4. Restarts backend
5. Tests API endpoint

## Manual Steps

### Backup
```bash
docker exec orthoandspinetools-postgres pg_dump -U postgres -d orthoandspinetools > backup.sql
gzip backup.sql
```

### Restore
```bash
gunzip backup.sql.gz
docker cp backup.sql orthoandspinetools-postgres:/tmp/restore.sql
docker exec orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -f /tmp/restore.sql
docker restart orthoandspinetools-backend
```

### Check Database
```bash
# View posts
docker exec orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -c "SELECT COUNT(*) FROM posts;"

# View users
docker exec orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -c "SELECT COUNT(*) FROM users;"
```

## Disaster Recovery

### Complete Data Loss
If the database volume is lost:

1. **Restore from backup:**
   ```bash
   ./scripts/database-restore.sh
   ```

2. **If no backups exist:**
   ```bash
   # Recreate database
   docker-compose -f docker-compose.prod.yml up -d postgres
   
   # Run migrations
   docker exec orthoandspinetools-backend npx prisma db push --accept-data-loss
   ```

### Password Mismatch
If authentication fails:

```bash
./scripts/database-ensure-connection.sh
```

Or manually:
```bash
docker exec orthoandspinetools-postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'secure_password_123';"
docker restart orthoandspinetools-backend
```

### Volume Corruption
If the database volume is corrupted:

1. **Backup current data:**
   ```bash
   ./scripts/database-backup-production.sh
   ```

2. **Remove corrupted volume:**
   ```bash
   docker stop orthoandspinetools-postgres
   docker volume rm orthoandspinetools-main_postgres_data
   ```

3. **Restart with fresh database:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d postgres
   ```

4. **Run migrations:**
   ```bash
   docker exec orthoandspinetools-backend npx prisma db push --accept-data-loss
   ```

5. **Restore data:**
   ```bash
   ./scripts/database-restore.sh backup_YYYYMMDD_HHMMSS.sql.gz
   ```

## Best Practices

1. **Run daily backups:** Automatic backups run at 2 AM
2. **Test restores regularly:** Ensure backups are valid
3. **Keep multiple backups:** Script keeps last 7 days
4. **Monitor disk space:** Backups can grow large
5. **Document manual changes:** Track any manual database changes

## Monitoring

### Check Backup Status
```bash
ls -lh /home/dstrad/orthoandspinetools-main/backups/
```

### Check Backup Logs
```bash
tail -f /home/dstrad/orthoandspinetools-main/logs/database-backup.log
```

### Verify API Health
```bash
curl -k "https://orthoandspinetools.com/api/posts?limit=1"
```

## Troubleshooting

### Backup Fails
- Check PostgreSQL container is running: `docker ps | grep postgres`
- Check disk space: `df -h`
- Check permissions on backup directory

### Restore Fails
- Verify backup file integrity: `gunzip -t backup.sql.gz`
- Check database is accessible: `docker exec orthoandspinetools-postgres psql -U postgres -c "SELECT 1;"`
- Check logs: `docker logs orthoandspinetools-postgres`

### API Still Failing After Restore
- Restart backend: `docker restart orthoandspinetools-backend`
- Run connection fix: `./scripts/database-ensure-connection.sh`
- Check backend logs: `docker logs orthoandspinetools-backend --tail 50`

## Contact

For issues with the database maintenance system, check:
1. Script logs in `/home/dstrad/orthoandspinetools-main/logs/`
2. Backend logs: `docker logs orthoandspinetools-backend`
3. PostgreSQL logs: `docker logs orthoandspinetools-postgres`

