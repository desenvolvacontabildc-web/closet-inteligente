# CLOSET INTELIGENTE - Infraestrutura de Produção

## Padrão oficial
O Closet Inteligente deve seguir o mesmo padrão operacional adotado pela Desenvolva para o FLOW: **VPS Linux + Docker + Caddy**, com cada aplicação isolada em seu próprio stack e roteada por subdomínio.

## Topologia V1

Internet -> Caddy (HTTPS) -> `closet-web`

Rede privada Docker:
- `closet-web`: Next.js/Node.js.
- `closet-db`: PostgreSQL.
- `closet-storage`: MinIO (S3-compatible) para fotos e arquivos privados.
- `closet-backup`: job agendado ou serviço externo para backup de banco e objetos.

O banco e o storage **não devem publicar portas para a internet**.

## Domínio
Usar subdomínio próprio da empresa, por exemplo `closet.desenvolvacontabil.com.br` ou outro que a proprietária definir. Caddy deve emitir/renovar TLS automaticamente.

## Containers e persistência
- Aplicação stateless sempre que possível.
- PostgreSQL com volume persistente próprio.
- MinIO com volume persistente próprio.
- Uploads nunca devem depender do filesystem efêmero do container da aplicação.
- Migrations devem ser versionadas no repositório.

## Autenticação
A V1 usa autenticação da aplicação, com usuários/sessões no PostgreSQL e cookies seguros (`HttpOnly`, `Secure`, `SameSite`). A Sprint 0 prepara armazenamento de sessões opacas, validação no backend e contexto transacional de tenant, sem fluxos de login/cadastro. A integração de biblioteca de autenticação, se necessária para esses fluxos, fica para a etapa autorizada correspondente.

## Armazenamento privado
A aplicação deve falar com uma interface S3. Na V1, o provider recomendado é MinIO. Dessa forma, uma migração futura para AWS S3, Cloudflare R2 ou outro S3-compatible não exige reescrever as regras de negócio.

Regras:
- bucket privado;
- URLs assinadas com prazo curto;
- nomes de objetos não expõem dados pessoais;
- validação de MIME, tamanho e extensão;
- remoção de metadados desnecessários das imagens quando aplicável.

## Multi-tenant
Isolamento obrigatório por `user_id`/`tenant_id` em toda leitura e escrita. A autorização da aplicação é a primeira barreira. PostgreSQL RLS pode ser utilizado como segunda barreira, usando contexto de sessão/transação definido pelo backend.

## Backups
Antes do beta público:
- dump automático do PostgreSQL;
- backup dos objetos privados;
- cópia fora da VPS;
- criptografia em trânsito e, quando disponível, em repouso;
- retenção documentada;
- teste real de restauração.

Um backup não é considerado válido até que uma restauração de teste tenha sido concluída.

## Ambientes
- Dev: local via Docker Compose.
- Staging: VPS/subdomínio de testes ou stack isolado na infraestrutura da Desenvolva.
- Produção: stack isolado, volumes próprios e segredos próprios.

A topologia lógica deve permanecer igual entre os ambientes para evitar diferenças de comportamento.

## Observabilidade
- logs estruturados;
- health endpoint;
- restart policy;
- acompanhamento de CPU/RAM/disco;
- erro de aplicação;
- custo e latência das chamadas de IA;
- alertas de disco e falha de backup.

## Escalabilidade
Começar simples. Não criar Kubernetes ou microsserviços sem necessidade comprovada. Quando houver crescimento, os componentes já estarão desacoplados o suficiente para mover banco, storage, workers ou aplicação para serviços/hosts separados.

## Regra para o Codex
Não substituir esta arquitetura por Vercel, Supabase, Firebase ou outro PaaS sem autorização explícita. Caso proponha mudança, deve apresentar motivo, custo, impacto operacional e plano de migração antes de executar.

## Estado da implementação

Além da fundação, a aplicação já contém autenticação própria, onboarding, perfis, Closet com CRUD, fotos privadas no MinIO e revisão de confiança. A análise visual OpenAI permanece opcional e deve receber `OPENAI_API_KEY` somente como segredo do servidor.
