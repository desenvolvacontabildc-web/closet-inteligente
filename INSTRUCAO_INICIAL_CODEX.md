# Instrução inicial para o Codex - Closet Inteligente

Leia somente o contexto necessário para a tarefa autorizada:
1. `README.md` — estado da fundação e operação.
2. `ESPECIFICACAO_MESTRE_CLOSET_INTELIGENTE.md` — escopo do produto.
3. `INFRAESTRUTURA_PRODUCAO_CLOSET.md` — arquitetura oficial.
4. `migrations/0001_foundation.sql` — schema implementado da fundação.
5. `docker-compose.yml` — stack executável.

As referências anteriores a schema e plano separados não correspondiam a arquivos
entregues. A Sprint 0 autorizada está delimitada no README; não criar schema de
negócio ou avançar à Sprint 1 sem autorização. DOCX/PDF são versões históricas;
para decisões técnicas, prevalecem os documentos Markdown atualizados.

## Regra de infraestrutura
A arquitetura oficial de produção é **VPS Linux + Docker + Caddy**, compatível com o padrão utilizado pela Desenvolva no FLOW. Não substitua por Vercel, Supabase, Firebase ou outro PaaS sem autorização explícita.

A V1 deve usar:
- Next.js + React + TypeScript;
- PostgreSQL em container com volume persistente;
- autenticação gerenciada pela aplicação e persistida no PostgreSQL;
- storage privado S3-compatible, com MinIO na V1;
- Caddy como reverse proxy/HTTPS;
- Docker Compose;
- isolamento multi-tenant obrigatório;
- backups externos e restauração testável.

## Limite atual
Sprint 0: somente fundação técnica, configurações, migrations de identidade,
autorização multi-tenant e procedimentos operacionais. Sem funcionalidades de negócio.
Ao concluir, informar validações e pendências reais e aguardar nova autorização.

Preserve rigorosamente o escopo da V1 e não acrescente funcionalidades não solicitadas.
