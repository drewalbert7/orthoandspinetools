# Item 8: dstrad in the docker group (= root). Draft plan. Needs an OST Operator design decision.

Today: dstrad (sudo group, 2 SSH keys) is in `docker`. Its crontab runs the DB backup, analytics
backup, disk cleanup (`docker volume prune -f`), SSL renew, uptime, digest, MAUDE warm and disk-alert
jobs. deploy.sh refuses to run as root and drives docker directly as dstrad.

## Phase A (in this PR, no group change yet)
1. DB backups move to root systemd timers (ost-db-backup / ost-basebackup / ost-wal-ship). Remove the
   dstrad cron line for `database-backup-cron.sh` after the first verified encrypted run (keep the local
   dump script for one week in parallel, R2 leg disabled).
2. Drop `docker volume prune -f` from scripts/docker-disk-check.sh (item 2).
3. Audit trail now (no behaviour change):
   - /etc/sudoers.d/ost-audit: `Defaults log_output` + `Defaults!/usr/bin/sudoreplay !log_output`
   - auditd: `-w /var/run/docker.sock -p rwxa -k docker_sock` and `-w /usr/bin/docker -p x -k docker_exec`
     (apt install auditd; persistent rules in /etc/audit/rules.d/ost-docker.rules; `augenrules --load`).

## Phase B (separate change window; needs Drew's OK via CEO)
Remove dstrad from `docker` (`gpasswd -d dstrad docker`, effective next login). Everything that still needs
docker then runs as root through **root-owned copies** of reviewed scripts (never sudo a file dstrad can edit):

    # /etc/sudoers.d/ost-docker   (visudo -cf to check)
    Cmnd_Alias OST_OPS = /usr/local/sbin/ost-deploy, /usr/local/sbin/ost-db-migrate, \
                         /usr/local/sbin/ost-docker-disk-check, /usr/local/sbin/ost-analytics-backup
    dstrad ALL=(root) NOPASSWD: OST_OPS
    Defaults!OST_OPS log_output

`/usr/local/sbin/ost-*` are root:root 0755 copies installed by root from a reviewed git SHA
(`install -o root -g root -m 0755`). deploy.sh's "refuse root" check needs a carve-out for this wrapper
(e.g. `OST_DEPLOY_VIA_WRAPPER=1` set only by /usr/local/sbin/ost-deploy). The remaining dstrad cron jobs
that call docker (analytics-backup, docker-disk-check, digest/MAUDE if they use docker exec) move to root
cron.d or systemd timers. Rootless docker is the cleaner end state but means migrating every container
and volume; not recommended now.

## dstrad cron inventory (read-only, 2026-10-17)
| Cron line (dstrad) | Calls docker? | Phase B home |
|---|---|---|
| 02:00 `database-backup-cron.sh` -> `database-backup-production.sh` | yes (`docker exec ... pg_dump`) | retire after ost-db-backup.timer has one good week; else root timer |
| 02:15 `analytics-backup.sh` | yes (`docker exec`) | root timer (`/usr/local/sbin/ost-analytics-backup`) |
| monthly `docker-disk-check.sh cleanup` | yes (builder/image prune, df; no volume prune after this PR) | root cron.d (`/usr/local/sbin/ost-docker-disk-check`) |
| */5 `uptime-monitor-cron.sh` -> `uptime-monitor.sh` | yes (`docker compose ps` / `exec`) | root timer, or switch to HTTP-only checks |
| monthly `ssl-renew-cron.sh` -> `update-ssl-certs.sh` | yes (`docker run certbot`, nginx reload) | root cron.d |
| `digest-cron.sh`, `maude-warm-cron.sh` | no (curl only) | stay as dstrad |
| */15 `scripts/ops/disk-alert.sh` | no | stay as dstrad |

So phase B needs root-owned copies for five jobs, not two: add `ost-uptime-monitor` and `ost-ssl-renew`
to the Cmnd_Alias (or move them to root timers).

## deploy.sh and sudo (decision for the Operator)
This PR runs migrations from deploy.sh as `sudo -n /usr/local/sbin/ost-db-migrate` (root-owned copy), so
phase A already needs one sudoers line: `dstrad ALL=(root) NOPASSWD: /usr/local/sbin/ost-db-migrate`.
Trade-off to note: ost-db-migrate runs `docker compose -f docker-compose.prod.yml run backend` from the repo,
and that compose file is dstrad-editable, so a dstrad compromise can still reach root through it. That is
no worse than today (dstrad is in the docker group), but it means phase B is not complete until the
deploy path also runs from a root-owned checkout or a root-owned compose file.
