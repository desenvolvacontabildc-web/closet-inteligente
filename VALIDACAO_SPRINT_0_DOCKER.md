# Validação externa da Sprint 0

Roteiro preparado, **não executado**. Execute os blocos em ordem, na mesma sessão
Bash, na pasta de uma cópia do projeto em Linux. Pare no primeiro erro.

## 1. Pré-requisitos e ambiente

Docker Engine ativo, Compose v2 com `--wait`, Bash, acesso às imagens e espaço para
dois stacks e um backup. Use somente dados fictícios, projetos/volumes novos e
redes exclusivas. Não use produção nem `down -v`. Nenhuma porta será publicada;
o Caddy temporário valida o proxy interno, sem alterar DNS/TLS de produção.

```bash
set -euo pipefail
umask 077
docker version
docker compose version
test ! -e .env.validation
cp .env.example .env.validation
chmod 600 .env.validation
```

Preencha `.env.validation` antes de continuar (não compartilhe esse arquivo):

| Variável | Valor |
|---|---|
| `APP_URL` | `http://closet-s0-proxy:8080` (somente teste interno) |
| `POSTGRES_DB` | `closet` |
| `POSTGRES_PASSWORD`, `DB_APP_PASSWORD` | Duas senhas distintas, cada uma com pelo menos 32 caracteres hexadecimais aleatórios |
| `MINIO_ROOT_PASSWORD`, `MINIO_APP_PASSWORD` | Outras duas senhas com o mesmo requisito |
| `CADDY_NETWORK` | Sobrescrita nos comandos abaixo para isolar cada stack |
| `MINIO_IMAGE`, `MINIO_MC_IMAGE` | Imagens do exemplo; mantenha as mesmas imagens durante todo o teste e registre seus IDs/digests |

## 2. Subida e migrations

```bash
export CADDY_NETWORK=closet_s0_validation_caddy
STACK=closet-s0-validation
dc() { docker compose --env-file .env.validation -p "$STACK" "$@"; }
sql() { dc exec -T db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
test -z "$(docker ps -aq --filter label=com.docker.compose.project="$STACK")"
test -z "$(docker volume ls -q --filter label=com.docker.compose.project="$STACK")"
docker network create "$CADDY_NETWORK"
dc config --quiet
dc up --build -d --wait --wait-timeout 180
dc ps -a
dc logs --no-color migrate storage-init
dc images
# Reexecução intencional: comprova idempotência, sem novo build.
dc run --rm --no-deps migrate
sql <<'SQL'
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM schema_migrations) = 1, 'Quantidade inesperada de migrations';
  ASSERT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0001_foundation.sql'), 'Migration ausente';
  ASSERT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'closet_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls), 'Papel web inseguro';
END $$;
SQL
```

Esperado: `migrate` e `storage-init` encerrados com código 0; `db` e `web` saudáveis.

## 3. MinIO, aplicação e Caddy

```bash
dc run --rm --no-deps --entrypoint /bin/sh storage-init -ec '
  mc alias set admin http://storage:9000 closet_admin "$MINIO_ROOT_PASSWORD" >/dev/null
  mc anonymous get admin/closet-private
  mc alias set app http://storage:9000 closet-web "$MINIO_APP_PASSWORD" >/dev/null
  printf sprint0 | mc pipe app/closet-private/validation.txt
'
object_check() {
  dc run --rm --no-deps --entrypoint /bin/sh storage-init -ec '
    mc alias set app http://storage:9000 closet-web "$MINIO_APP_PASSWORD" >/dev/null
    test "$(mc cat app/closet-private/validation.txt)" = sprint0
  '
}
object_check
dc exec -T web node -e 'Promise.all([fetch("http://127.0.0.1:3000/health"),fetch("http://storage:9000/minio/health/live"),fetch("http://storage:9000/closet-private/validation.txt")]).then(async ([h,m,a])=>{if(h.status!==200 || (await h.json()).status!=="ok" || m.status!==200 || a.status!==403)throw Error("Health/MinIO/acesso anônimo falhou");console.log("PASS health, MinIO e bucket privado")}).catch(e=>{console.error(e.message);process.exit(1)})'
docker run -d --name closet-s0-proxy --network "$CADDY_NETWORK" caddy:2-alpine caddy reverse-proxy --from :8080 --to closet-web:3000
dc exec -T web node -e '(async()=>{for(let i=0;i<30;i++){try{const r=await fetch("http://closet-s0-proxy:8080/health");if(r.ok && (await r.json()).status==="ok"){console.log("PASS Caddy");return}}catch{}await new Promise(r=>setTimeout(r,1000))}throw Error("Caddy indisponível")})().catch(e=>{console.error(e.message);process.exit(1)})'
```

Esperado: política anônima `private`, leitura com credencial da aplicação aceita,
leitura anônima negada e `/health` respondendo diretamente e através do Caddy.

## 4. Dois tenants e RLS

Insira fixtures somente neste banco novo. A consulta sob `closet_app` deve enxergar
o próprio tenant, negar o outro e negar acesso sem contexto. Sem permissões de escrita.

```bash
sql <<'SQL'
BEGIN;
INSERT INTO app_users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000001','s0-a@example.invalid'),
 ('00000000-0000-0000-0000-000000000002','s0-b@example.invalid');
INSERT INTO tenants(id) VALUES
 ('00000000-0000-0000-0000-000000000101'),
 ('00000000-0000-0000-0000-000000000102');
INSERT INTO tenant_memberships(tenant_id,user_id) VALUES
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000002');
COMMIT;
SQL
rls_check() {
sql <<'SQL'
BEGIN;
SET LOCAL ROLE closet_app;
DO $$ DECLARE n integer; u uuid; t uuid; other_t uuid; BEGIN
  ASSERT current_user = 'closet_app', 'Teste fora do papel web';
  ASSERT (SELECT count(*) FROM tenants) = 0, 'Acesso sem contexto';
  ASSERT NOT has_table_privilege(current_user, 'tenants', 'INSERT'), 'Escrita indevida';
  FOR n IN 1..2 LOOP
    u := ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
    t := ('00000000-0000-0000-0000-' || lpad((100+n)::text,12,'0'))::uuid;
    other_t := ('00000000-0000-0000-0000-' || lpad((103-n)::text,12,'0'))::uuid;
    PERFORM set_config('app.user_id',u::text,true);
    PERFORM set_config('app.tenant_id',t::text,true);
    ASSERT (SELECT count(*) FROM tenants) = 1 AND EXISTS (SELECT 1 FROM tenants WHERE id=t), 'Tenant próprio incorreto';
    ASSERT (SELECT count(*) FROM app_users) = 1 AND EXISTS (SELECT 1 FROM app_users WHERE id=u), 'Usuário incorreto';
    ASSERT (SELECT count(*) FROM tenant_memberships) = 1, 'Vínculo incorreto';
    PERFORM set_config('app.tenant_id',other_t::text,true);
    ASSERT (SELECT count(*) FROM tenants) = 0, 'Vazamento entre tenants';
    ASSERT (SELECT count(*) FROM tenant_memberships) = 0, 'Vazamento de vínculos';
  END LOOP;
END $$;
ROLLBACK;
SQL
}
rls_check
```

Esse teste comprova RLS com contexto fornecido pelo backend; não valida login ou
emissão de sessões, que não fazem parte da Sprint 0.

## 5. Persistência e backup/restauração

```bash
dc restart db storage web
dc up -d --wait --wait-timeout 120
rls_check
object_check

# Backup consistente das fixtures; interromper escritores e MinIO.
BACKUP_DIR="$(pwd)/backups/sprint0-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
dc stop web storage
dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/database.dump"
dc run --rm --no-deps -T --entrypoint tar backup-tools -C /data -czf - . > "$BACKUP_DIR/objects.tar.gz"
dc start storage web
(cd "$BACKUP_DIR" && sha256sum database.dump objects.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS)

# Restore em outro projeto e outra rede, sem tocar nos volumes originais.
STACK=closet-s0-restore
export CADDY_NETWORK=closet_s0_restore_caddy
test -z "$(docker ps -aq --filter label=com.docker.compose.project="$STACK")"
test -z "$(docker volume ls -q --filter label=com.docker.compose.project="$STACK")"
docker network create "$CADDY_NETWORK"
dc up -d --wait --wait-timeout 120 db
sql <<'SQL'
CREATE ROLE closet_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
SQL
dc exec -T db sh -c 'pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BACKUP_DIR/database.dump"
dc run --rm --no-deps -T --entrypoint tar backup-tools -C /data -xzf - < "$BACKUP_DIR/objects.tar.gz"
# Reutiliza imagens locais do primeiro stack; não recompila nem atualiza MinIO.
docker tag closet-s0-validation-web closet-s0-restore-web
docker tag closet-s0-validation-migrate closet-s0-restore-migrate
dc up -d --no-build --pull never --wait --wait-timeout 120
rls_check
object_check
dc exec -T web node -e 'fetch("http://127.0.0.1:3000/health").then(async r=>{if(!r.ok || (await r.json()).status!=="ok")throw Error("Health falhou");console.log("PASS restore health")}).catch(e=>{console.error(e.message);process.exit(1)})'
```

Se qualquer comando falhar, não declare sucesso. Em erro durante backup, retome
conscientemente `web` e `storage` do projeto original. Preserve arquivos e volumes
para diagnóstico. Ao terminar, pare ambos os stacks e o proxy, sem apagar dados:

```bash
dc stop
STACK=closet-s0-validation
export CADDY_NETWORK=closet_s0_validation_caddy
dc stop
docker stop closet-s0-proxy
```

## Critério final

**SPRINT 0 VALIDADA: SIM** somente se todas as etapas passarem: migrations
idempotentes, papel web sem bypass, acesso próprio permitido e cruzado negado,
bucket privado com leitura autenticada, `/health` direto e via Caddy, fixtures e
objeto preservados após reinício e recuperados no stack isolado. Registre data,
versões/digests e resultados, sem segredos. DNS/HTTPS público, backup externo e
login não são certificados por este roteiro. Não avançar à Sprint 1 automaticamente.
