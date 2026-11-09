#!/bin/bash
# Backup diário do Closet Inteligente (rodado pelo closet-backup.timer, que fica em deploy/).
#   - Banco: pg_dump compactado e validado; guarda os últimos 14 dias.
#   - Fotos (MinIO): espelho incremental (rsync) do volume de objetos.
# Falha com código diferente de zero (o systemd marca o serviço como "failed") se o dump vier vazio ou corrompido.
set -euo pipefail
umask 077
APP=/opt/closet-inteligente
DEST="$APP/backups"
TS=$(date -u +%Y%m%dT%H%M%SZ)
cd "$APP"
set -a; . ./.env; set +a
mkdir -p "$DEST/db" "$DEST/fotos"

OUT="$DEST/db/closet-$TS.sql.gz"
docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db pg_dump -U closet_owner -d closet | gzip -9 > "$OUT.tmp"
gzip -t "$OUT.tmp"
[ "$(stat -c %s "$OUT.tmp")" -gt 5000 ] || { echo "dump suspeito (muito pequeno)"; rm -f "$OUT.tmp"; exit 1; }
mv "$OUT.tmp" "$OUT"

rsync -a --delete /var/lib/docker/volumes/closet_closet_objects/_data/ "$DEST/fotos/"
find "$DEST/db" -name 'closet-*.sql.gz' -mtime +14 -delete

echo "$TS ok | banco: $(du -h "$OUT" | cut -f1) | fotos: $(du -sh "$DEST/fotos" | cut -f1) | dumps guardados: $(ls "$DEST/db" | wc -l)" | tee "$DEST/ULTIMO_BACKUP.txt"
