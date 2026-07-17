#!/bin/sh
# Homeguard PostgreSQL backup + offsite sync
#
# Lives on the QNAP at /share/Container/homeguard/backup.sh, run nightly at
# 02:00 UTC by the homeguard-backup-cron-1 container (a plain alpine:3.20
# container, not a git-tracked compose service — see its docker inspect
# output for the exact `apk add curl rclone` + crontab startup command).
# This copy in git is for documentation/version history; the QNAP's live
# copy is the one that actually runs and must be kept in sync manually.
set -e

BACKUP_DIR=/share/Container/homeguard/backups
RETENTION_DAYS=30
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/homeguard-$TIMESTAMP.sql.gz"
LOG_FILE="$BACKUP_DIR/backup.log"
RCLONE_CONFIG=/share/Container/homeguard/rclone.conf

log() { echo "[$(date -u)] $1" | tee -a "$LOG_FILE"; }

# Load credentials from .env
DB_PASS=$(grep '^DB_PASSWORD=' /share/Container/homeguard/.env 2>/dev/null | cut -d= -f2)
DB_USER=$(grep '^DB_USER=' /share/Container/homeguard/.env 2>/dev/null | cut -d= -f2)
DB_NAME=$(grep '^DB_NAME=' /share/Container/homeguard/.env 2>/dev/null | cut -d= -f2)
MINIO_BUCKET=$(grep '^MINIO_BUCKET_NAME=' /share/Container/homeguard/.env 2>/dev/null | cut -d= -f2)
DB_USER=${DB_USER:-homeguard}
DB_NAME=${DB_NAME:-homeguard}
MINIO_BUCKET=${MINIO_BUCKET:-homeguard}

if [ -z "$DB_PASS" ]; then
  log "ERROR: DB_PASSWORD not found in .env — aborting"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# pg_dump inside the running postgres container, pipe through gzip, write to backup dir
# The backup dir is mounted into the postgres container via Docker exec env trick:
# We use a wrapper that redirects output to the host-accessible path via the
# postgres container's data volume mount bind — actually we exec pg_dump and
# capture via the exec API, gzip locally.

EXEC_PAYLOAD="{\"AttachStdout\":true,\"AttachStderr\":true,\"Tty\":false,\"Env\":[\"PGPASSWORD=${DB_PASS}\"],\"Cmd\":[\"sh\",\"-c\",\"pg_dump -h localhost -U ${DB_USER} ${DB_NAME}\"]}"

EXEC_ID=$(curl -s --unix-socket /var/run/docker.sock \
  -X POST -H 'Content-Type: application/json' \
  -d "$EXEC_PAYLOAD" \
  'http://localhost/containers/infrastructure-postgres-1/exec' \
  | grep -o '"Id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$EXEC_ID" ]; then
  log "ERROR: Could not create exec — is postgres running?"
  exit 1
fi

# Stream exec output (raw Docker multiplexed stream) through strings to strip
# the 8-byte frame headers, then gzip to file
curl -s --unix-socket /var/run/docker.sock \
  -X POST -H 'Content-Type: application/json' \
  -d '{"Detach":false}' \
  "http://localhost/exec/${EXEC_ID}/start" \
  | strings | gzip > "$BACKUP_FILE"

EXIT_CODE=$(curl -s --unix-socket /var/run/docker.sock \
  "http://localhost/exec/${EXEC_ID}/json" | grep -o '"ExitCode":[0-9]*' | cut -d: -f2)

if [ "$EXIT_CODE" != "0" ] || [ ! -s "$BACKUP_FILE" ]; then
  log "ERROR: pg_dump failed (exit ${EXIT_CODE:-unknown}) — removing empty backup"
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE=$(du -sh "$BACKUP_FILE" 2>/dev/null | cut -f1 || echo '?')
log "Backup OK: homeguard-${TIMESTAMP}.sql.gz (${SIZE})"

# Prune old backups beyond retention window
DELETED=$(find "$BACKUP_DIR" -name 'homeguard-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
REMAINING=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
log "Retention: kept ${REMAINING} backup(s), pruned ${DELETED} file(s) older than ${RETENTION_DAYS}d"

# ── Offsite sync (added 2026-07-17) ─────────────────────────────────────────
# Google Drive, via rclone (installed into this container's alpine image at
# startup alongside curl — see the container's own startup command). Covers
# both the Postgres dumps above AND the MinIO-stored file uploads (vendor
# docs, inspection photos) — the latter previously wasn't backed up anywhere
# at all, on- or off-site. Never blocks/fails the DB backup itself above —
# offsite sync issues are logged but don't affect the exit code, since the
# local backup succeeding is the more critical outcome.
if [ -f "$RCLONE_CONFIG" ]; then
  log "Syncing DB backups to Google Drive..."
  if rclone sync "$BACKUP_DIR" gdrive:attenteve-backups/db-backups \
      --config "$RCLONE_CONFIG" --exclude backup.log --log-file "$LOG_FILE" --log-level INFO; then
    log "Offsite DB sync OK"
  else
    log "ERROR: offsite DB sync failed — see log above"
  fi

  log "Syncing MinIO files to Google Drive..."
  if rclone sync "minio:${MINIO_BUCKET}" gdrive:attenteve-backups/minio-files \
      --config "$RCLONE_CONFIG" --log-file "$LOG_FILE" --log-level INFO; then
    log "Offsite MinIO sync OK"
  else
    log "ERROR: offsite MinIO sync failed — see log above"
  fi
else
  log "WARNING: rclone config not found at $RCLONE_CONFIG — skipping offsite sync"
fi
