# Closet Inteligente — Sprint 0

Fundação técnica em Next.js/React/TypeScript, PostgreSQL, MinIO e Docker Compose,
para VPS Linux com Caddy compartilhado. Sem fluxos de usuário ou funcionalidades de negócio.

## Documentação vigente

Os documentos Markdown deste repositório são a fonte vigente. A especificação
`.docx` e `.pdf` recebida é um retrato anterior, não atualizado nesta Sprint;
suas referências a Supabase/Vercel não se aplicam. A arquitetura oficial é
**VPS Linux + Docker + Caddy**, definida em `INFRAESTRUTURA_PRODUCAO_CLOSET.md`.

## Execução local mínima

Node.js 24 e pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Acesse `http://127.0.0.1:3000/health`. O endpoint verifica somente o processo
web e não comprova conexão com PostgreSQL ou MinIO. A página raiz é um marcador
estático de instalação. Não há cadastro, login, uploads ou telas funcionais.
Para validar a infraestrutura integrada, use Docker Compose em ambiente isolado.

## Stack Docker e Caddy

1. Copie `.env.example` para `.env` e preencha quatro senhas aleatórias distintas
   (mínimo de 32 caracteres; use hexadecimal para evitar interpolação do Compose).
2. Defina `APP_URL`, banco e nome da rede externa. Segredos não são incluídos na imagem.
3. Confirme a rede do Caddy existente (`docker network inspect caddy_shared`).
   Em host novo de teste, crie-a com `docker network create caddy_shared`.
4. Use `infra/Caddyfile.example` na configuração do Caddy já existente, conectado
   à rede selecionada. Não é criado um segundo proxy. DNS/TLS e alterações no
   Caddy de produção exigem uma etapa de implantação autorizada.
5. Execute:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps -a
docker compose exec web node -e "fetch('http://127.0.0.1:3000/health').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)})"
```

`migrate` e `storage-init` devem terminar com código 0; `web` e `db` devem ficar
saudáveis. Banco e storage têm volumes próprios, rede interna e nenhuma porta
publicada. Somente a aplicação participa da rede externa do Caddy.
Dev/staging/produção devem ter projetos Compose, volumes, segredos, redes Caddy e
aliases separados; não conecte dois stacks com alias `closet-web` à mesma rede.

O Compose usa as imagens MinIO do exemplo recebido. Antes de staging/produção,
fixe `MINIO_IMAGE` e `MINIO_MC_IMAGE` em digests aprovados após validar o stack;
`latest` não garante reprodução. Não atualize imagens de banco/storage sem backup.
Não use `docker compose down -v` em ambientes com dados.

## Migrations e autenticação

`migrations/0001_foundation.sql` contém apenas usuários, tenants, vínculos e sessões.
`scripts/migrate.mjs` aplica arquivos em ordem, registra checksum, usa lock e uma
transação por migration. Arquivos já aplicados não devem ser editados; crie o próximo.
O serviço `migrate` usa o administrador e configura o papel `closet_app` separado.
As credenciais administrativas do banco e do MinIO não chegam ao container web.

`src/server/auth.ts` prepara cookie HttpOnly/SameSite, Secure em produção, e
validação de token aleatório armazenado somente como hash SHA-256. Não há emissor
de sessões ou escolha de biblioteca de login nesta etapa; a futura integração
deve preservar a validação e não receber um `user_id` confiável do navegador.

Rotas autenticadas futuras devem usar `withTenant`: verifica sessão e vínculo,
define o contexto RLS dentro da transação e descarta-o ao terminar. O papel web
não é dono das tabelas e não pode ignorar RLS. Não há permissões de escrita na
fundação; novos fluxos exigirão migrations específicas. Não há usuário inicial.
O pool bruto é infraestrutura interna, não uma alternativa à autorização.

MinIO recebe um bucket privado e usuário próprio da aplicação, restrito ao bucket.
O isolamento de objetos por tenant ainda não é implementado, pois não há upload:
ao implementar, os caminhos e a autorização devem derivar do tenant validado
pelo backend. Não entregar chaves S3 ao navegador. URLs com host interno `storage`
não são acessíveis pelo navegador; o futuro fluxo de arquivos precisará entregar
os objetos por rota autenticada ou mecanismo aprovado, sem publicar o MinIO.

## Backup e restauração

Consulte `docs/BACKUP_RESTAURACAO.md`. Nenhum backup agendado, envio externo,
restauração real ou deploy foi realizado nesta Sprint.

## Validação da Sprint 0 — 12/09/2026

- Instalação das dependências e lockfile concluídos com Node.js 24.19.0/pnpm 11.19.0.
- Um build de produção concluído, incluindo a verificação de TypeScript.
- Servidor standalone iniciado localmente: `/health` retornou HTTP 200, JSON
  esperado e `Cache-Control: no-store`; `/` retornou HTTP 200. Processo encerrado
  após a verificação.
- Sintaxe de `scripts/migrate.mjs` validada com `node --check`.
- Docker não localizado no ambiente desta execução. Imagens, Compose, migrations
  no PostgreSQL, isolamento RLS em execução, MinIO e restauração permanecem sem
  validação integrada. `/health` não substitui essas verificações.
- Próxima etapa: validar o stack em Docker disponível e ambiente isolado, antes
  de autorizar a Sprint 1. Nenhum acesso à VPS ou alteração de produção realizado.
# Análise visual opcional

O botão “Analisar com IA” usa a API de Responses da OpenAI somente quando `OPENAI_API_KEY` está configurada no ambiente do servidor. A foto é lida do MinIO privado, enviada para análise e o resultado é salvo como `INFERRED`; a confirmação continua manual.

## Estado funcional atual

O Bloco Funcional 1 está validado: cadastro, login com senha, onboarding, personalização, sessão persistente, logout e isolamento multi-tenant.

O Closet já possui cadastro, edição, exclusão, grade, detalhe, códigos por categoria, upload privado de fotos no MinIO, rota autenticada de leitura, revisão `OBSERVED`/`CONFIRMED` e exclusão de objetos. A análise visual da OpenAI é opcional e requer `OPENAI_API_KEY` apenas no servidor.
