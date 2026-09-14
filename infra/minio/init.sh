#!/bin/sh
set -eu
umask 077
attempt=0
until mc alias set local http://storage:9000 closet_admin "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && mc ready local >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'MinIO não ficou disponível para inicialização.' >&2
    exit 1
  fi
  sleep 2
done
mc mb --ignore-existing local/closet-private >/dev/null
mc anonymous set none local/closet-private >/dev/null
mc admin user add local closet-web "$MINIO_APP_PASSWORD" >/dev/null
mc admin policy create local closet-web /bootstrap/policy.json >/dev/null
mc admin policy attach local closet-web --user closet-web >/dev/null
echo 'Bucket privado e credenciais da aplicação preparados.'
