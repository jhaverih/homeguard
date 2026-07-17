#!/bin/sh
# Startup script for the homeguard-backup-cron-1 container (plain alpine:3.20,
# not a compose service — see infrastructure/backup.sh's header comment for
# why). Self-provisions its own tools on every container start/recreation so
# nothing has to be manually reinstalled if the container is ever recreated
# fresh from the image.
apk add --no-cache curl rclone
echo '0 2 * * * /share/Container/homeguard/backup.sh >> /share/Container/homeguard/backups/backup.log 2>&1' \
  > /etc/crontabs/root
echo "Backup cron container started — daily at 02:00 UTC"
crond -f -d 8
