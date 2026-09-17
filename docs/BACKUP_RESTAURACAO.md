# Backup e restauração — procedimento básico

Execute na VPS Linux, dentro do projeto. Nunca faça a primeira restauração em
produção. A cópia abaixo é local; um responsável deve transferi-la, junto com os
segredos necessários, para destino externo privado e criptografado. Não salve
senhas junto do backup nem no Git. Definir destino, retenção e agendamento é
pendência operacional anterior ao beta, não parte desta execução da Sprint 0.

## Cópia consistente do banco e dos objetos

Reserve uma janela de manutenção e interrompa todos os escritores. Na fundação,
somente `web` representa a aplicação. O banco permanece ligado; MinIO é parado
durante a cópia de seu volume. Os comandos não removem volumes.

```sh
umask 077
BACKUP_DIR="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
docker compose stop web storage
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar backup-tools -C /data -czf - . > "$BACKUP_DIR/objects.tar.gz"
docker compose start storage web
sha256sum "$BACKUP_DIR/database.dump" "$BACKUP_DIR/objects.tar.gz" > "$BACKUP_DIR/SHA256SUMS"
```

Verifique o código de saída de cada comando e a validade dos arquivos antes de
considerar a cópia concluída. Em caso de erro, mantenha o backup marcado como
inválido e retome os serviços conscientemente; não encadeie a rotina ignorando
falhas. A cópia de objetos inclui dados internos do MinIO: trate-a como sensível.
Registre commit da aplicação, versões/digests das imagens e configuração utilizada.
Preserve separadamente as quatro senhas num cofre: serão necessárias na restauração.

## Restauração em stack isolado

Use uma cópia do projeto com `.env` próprio, projeto Compose novo (`-p closet-restore`)
e uma rede Caddy de teste exclusiva. Não use os volumes nem DNS de produção.
Use as mesmas versões de PostgreSQL e MinIO do backup. Nos comandos abaixo,
substitua `<backup>` pelo caminho da cópia escolhida.

1. Confira checksums e inicie somente o banco novo:

```sh
sha256sum -c <backup>/SHA256SUMS
docker compose -p closet-restore up -d db
docker compose -p closet-restore exec db pg_isready -U closet_owner -d closet
```

2. Crie o papel referenciado nas permissões do dump. No banco vazio, não execute
   as migrations antes do restore para não criar tabelas conflitantes:

```sh
docker compose -p closet-restore exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE ROLE closet_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"'
docker compose -p closet-restore exec -T db sh -c 'pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < <backup>/database.dump
```

3. Restaure os objetos no volume novo, com o servidor MinIO ainda desligado:

```sh
docker compose -p closet-restore run --rm --no-deps -T --entrypoint tar backup-tools -C /data -xzf - < <backup>/objects.tar.gz
docker compose -p closet-restore up --build -d
docker compose -p closet-restore ps -a
```

O runner de migrations reconhecerá os checksums restaurados e configurará a senha
do papel web. O inicializador do MinIO reaplica bucket privado e credencial web.
Se houver erro em qualquer etapa, pare a restauração e investigue no stack isolado.
Confirme `/health`, contagens do banco, integridade de arquivos por amostragem e
negação de acesso entre tenants antes de registrar a restauração como válida.

## Execução real — 17/09/2026

Procedimento executado de ponta a ponta na VPS de produção, com dados reais (não
fixtures), antes da abertura para as primeiras usuárias de teste.

- Backup: `web` e `storage` parados por menos de um minuto (FLOW não foi afetado);
  `pg_dump` e `tar` do volume MinIO concluídos com checksums SHA-256 registrados em
  `backups/20260917T035159Z/SHA256SUMS`. Produção confirmada saudável após reinício.
- Restauração: stack isolado `-p closet-restore`, `.env` e rede Caddy exclusivos com
  segredos novos (nunca reaproveitados de produção), sem tocar nos volumes reais.
  `sha256sum -c` validou os arquivos antes de restaurar.
- Resultado: `/health/ready` OK; contagens no banco restaurado idênticas à produção
  (1 usuária, 40 peças de closet, 1 conta administradora, 10 migrations aplicadas);
  bucket MinIO restaurado com política `private` confirmada; RLS confirmado — o papel
  `closet_app` sem contexto de sessão não retorna nenhuma linha de `closet_items`.
- Stack de teste inteiro (containers, volumes e rede) removido após a validação.

**Procedimento certificado com dados reais. Pendência restante:** definir o destino
externo (fora da VPS) para onde o backup deve ser copiado, a retenção e o agendamento
automático — o backup validado acima permanece, por ora, apenas no disco local da
própria VPS.
