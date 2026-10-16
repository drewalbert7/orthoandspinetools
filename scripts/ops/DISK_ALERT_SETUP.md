# Disk Usage Alert Setup

Monitors disk usage on root (`/`) and Docker data root, alerting when usage exceeds 85%.

## Quick Install

```bash
# 1. Make script executable
chmod +x /path/to/orthoandspinetools-main/scripts/ops/disk-alert.sh

# 2. Create log file with proper permissions
sudo touch /var/log/disk-alert.log
sudo chown $USER:$USER /var/log/disk-alert.log

# 3. Add cron job (every 15 minutes)
(crontab -l 2>/dev/null; echo "*/15 * * * * /path/to/orthoandspinetools-main/scripts/ops/disk-alert.sh") | crontab -
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISK_ALERT_THRESHOLD` | `85` | Alert when usage exceeds this percentage |
| `DISK_ALERT_LOG` | `/var/log/disk-alert.log` | Log file path |
| `DISK_ALERT_WEBHOOK` | *(unset)* | Webhook URL for alerts (optional) |
| `DOCKER_DATA_ROOT` | `/var/lib/docker` | Docker data directory |

## Webhook Setup (Optional)

If `DISK_ALERT_WEBHOOK` is set, the script POSTs JSON to that URL:

```json
{
  "host": "server-hostname",
  "mount": "/",
  "usage_percent": 87,
  "available": "12G",
  "threshold": 85,
  "timestamp": "2026-10-16T03:00:00Z",
  "message": "Disk usage on / is at 87% (threshold: 85%)"
}
```

### Example: Slack Incoming Webhook

```bash
export DISK_ALERT_WEBHOOK="https://hooks.slack.com/services/T.../B.../..."
```

### Cron with Webhook

```bash
# Edit crontab
crontab -e

# Add with webhook URL
*/15 * * * * DISK_ALERT_WEBHOOK="https://hooks.slack.com/..." /path/to/disk-alert.sh
```

## Monitored Paths

1. **Root filesystem** (`/`)
2. **Docker data root** (`/var/lib/docker` by default)
3. **Hetzner volumes** (`/mnt/HC_Volume_*` if present)

## Log Format

```
[2026-10-16T03:15:00Z] ALERT: Root filesystem (/) at 87% — 12G free (threshold: 85%)
[2026-10-16T03:15:00Z] INFO: Failed to send webhook for /
```

---

## Docker Cleanup (Suggested, Disabled by Default)

Docker can accumulate significant disk usage from:
- Unused images (pulled but no longer used)
- Build cache
- Stopped containers
- Unused volumes

### Safe Weekly Prune (DISABLED BY DEFAULT)

**Review before enabling** — this removes unused Docker resources:

```bash
# DO NOT enable without understanding the impact
# This removes:
#   - All stopped containers
#   - All networks not used by at least one container
#   - All dangling images
#   - All dangling build cache

# Uncomment to add to crontab (weekly, Sunday 3 AM):
# 0 3 * * 0 docker system prune -f >> /var/log/docker-prune.log 2>&1
```

### More Aggressive Prune (USE WITH CAUTION)

```bash
# Removes ALL unused images, not just dangling ones
# WARNING: This will remove images that aren't currently running
# docker system prune -a -f

# Remove unused volumes too (DANGEROUS - can delete data)
# docker system prune -a --volumes -f
```

### Builder Cache Prune

```bash
# Remove build cache older than 7 days
# Safer than full prune, recommended for CI/build servers
# 0 4 * * 0 docker builder prune --filter "until=168h" -f >> /var/log/docker-prune.log 2>&1
```

### Manual Check Before Pruning

```bash
# See what would be removed
docker system df
docker system prune --dry-run
docker builder prune --dry-run
```

### Recommended Approach

1. **Monitor first** — Use the disk-alert.sh script to understand usage patterns
2. **Manual cleanup** — Run `docker system prune --dry-run` and review
3. **Gradual automation** — Start with builder cache prune, then expand

### Example Safe Cron (Builder Cache Only)

```bash
# Weekly builder cache cleanup (7+ days old) — relatively safe
0 4 * * 0 docker builder prune --filter "until=168h" -f >> /var/log/docker-prune.log 2>&1
```

---

## Troubleshooting

### Script doesn't run

```bash
# Check executable
ls -la scripts/ops/disk-alert.sh

# Test manually
./scripts/ops/disk-alert.sh

# Check cron logs
grep CRON /var/log/syslog | tail -20
```

### No alerts when expected

```bash
# Check current usage
df -h / /var/lib/docker

# Lower threshold for testing
DISK_ALERT_THRESHOLD=50 ./scripts/ops/disk-alert.sh
cat /var/log/disk-alert.log
```

### Webhook not working

```bash
# Test webhook manually
curl -X POST -H "Content-Type: application/json" \
  -d '{"text":"test"}' \
  "$DISK_ALERT_WEBHOOK"
```
