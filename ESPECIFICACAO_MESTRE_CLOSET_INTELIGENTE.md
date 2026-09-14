# CLOSET INTELIGENTE — Especificação Mestre de Produto e Engenharia

**Versão:** 1.0  
**Data:** 12/09/2026  
**Status:** Base aprovada para prototipação técnica e desenvolvimento da V1

## 1. Visão do produto

O Closet Inteligente é uma plataforma SaaS mobile-first de estilo, imagem pessoal e gestão inteligente do guarda-roupa. A proposta central é funcionar como uma consultora pessoal que conhece a cliente, conhece suas peças reais, aprende com o uso e a ajuda a vestir, comprar e planejar melhor.

**Promessa:** uma consultora pessoal que conhece você e conhece o seu closet.

### 1.1 Princípios invioláveis

1. Personalização real da experiência, comunicação e recomendações.
2. Closet real primeiro: nunca inventar que a cliente possui uma peça.
3. Sinceridade: não elogiar para agradar; apontar quando um look não funcionou e explicar como melhorar.
4. Não fingir certeza: distinguir fato, observação, inferência e desconhecido.
5. Aprendizado contínuo com correções, uso, conforto, rejeições e avaliações.
6. Consumo consciente: antes de recomendar compra, verificar equivalentes já existentes.
7. Independência editorial/comercial: parceria não compra a opinião da Stylist IA.
8. Privacidade por padrão: fotos e dados ficam isolados por conta e só são compartilhados mediante ação/consentimento explícito.

## 2. Público e posicionamento

O produto é voltado a mulheres que desejam vestir-se melhor, aproveitar mais o que já possuem, comprar com mais critério e desenvolver uma imagem pessoal coerente sem depender de uma consultoria humana permanente.

**Posicionamento de lançamento:** “Um Closet que conhece você, conhece suas roupas e ajuda você a se vestir, comprar e usar melhor o que tem.”

## 3. Escopo da V1

### 3.1 Entrada e personalização
- Cadastro/login.
- Anamnese guiada e visual.
- Preferências de estilo, rotina, objetivos, conforto, cores, compras e comunicação.
- Foto opcional.
- Geração de identidade visual adaptativa do app.
- Perfil editável após onboarding.

### 3.2 Closet
- Cadastro de peça por câmera ou galeria.
- Cadastro em lote.
- Classificação assistida por IA com confirmação da cliente.
- Código único por categoria.
- Fotos, cor, categoria, status e observações.
- Busca e filtros.
- Histórico da peça.
- Ações: criar look, ver combinações, adicionar foto, editar.

### 3.3 Stylist IA
- O que vestir hoje.
- Look para trabalho.
- Evento.
- Quero usar esta peça.
- Quero algo diferente.
- Avalie meu look.
- Estou pensando em comprar.
- Quero experimentar uma tendência.
- Conversa livre, mas com contexto estruturado do perfil e closet.

### 3.4 Looks
- Criar, salvar, usar, favoritar e rejeitar.
- Visual com peças reais e códigos.
- Histórico de looks.
- Feedback pós-uso.
- Foto real opcional.

### 3.5 Avaliação sincera
- Análise de caimento, proporção, combinação, acabamento, tecido aparente, acessórios, sapato e adequação à ocasião.
- Escala: Excelente / Muito bom / Funciona com ajustes / Eu mudaria / Não recomendo.
- Estrutura: o que funcionou → o que prejudicou → o que faria → alternativa do closet.

### 3.6 Compartilhamento e indicação
- “Compartilhe meu Look”.
- Layout Inspiração × Meu Look / Antes × Depois / Meu look de hoje.
- Story 9:16 e Feed 4:5.
- CTA e link/código de indicação.
- Consentimento separado para uso nas redes do Closet Inteligente.

### 3.7 Radar de Tendências
- Conteúdo administrável por período.
- Classificação personalizada: Muito a sua cara / Vale experimentar / Você já tem / Não priorizaria.
- Ação “usar com o que tenho” antes de compra.
- Parceiros e cupons apenas quando pertinente e sempre identificados.

### 3.8 Perfil
- Minha identidade.
- Meu estilo.
- Minhas preferências.
- Como gosto de receber opiniões.
- Aparência do app.
- Conta, assinatura e privacidade.

## 4. Premium e expansão

### 4.1 Premium de lançamento/primeira expansão
- Coloração Pessoal assistida por foto, com grau de confiança e orientações de captura.
- Dossiê de Cores: cores protagonistas, neutros, combinações, metais e aplicação no closet.
- Minha Assinatura de Estilo: essência, palavras-chave, referências, moodboard, o que valorizar/evitar e aplicação prática.
- Personal Shopping+.
- Closet Estratégico.
- Mala Inteligente.

### 4.2 Futuro
- Skin Care.
- Cronogramas de beleza.
- Comunidade moderada.
- Portal de parceiros/marcas.
- Catálogo de produtos parceiro integrado.

## 5. Arquitetura técnica recomendada

### 5.1 Visão geral

**Frontend:** Next.js + React + TypeScript, mobile-first e PWA.  
**UI:** Tailwind CSS + componentes próprios, design tokens por cliente.  
**Backend:** API Routes/Server Actions para orquestração simples; serviços independentes quando necessário.  
**Banco:** PostgreSQL em container Docker com volume persistente.  
**Auth:** autenticação da aplicação, com usuários e sessões persistidos no PostgreSQL.  
**Arquivos:** MinIO S3-compatible em bucket privado e volume persistente.  
**Segurança multi-tenant:** autorização no backend e RLS por usuário/tenant, com contexto por transação.  
**IA:** camada de orquestração própria com chamadas separadas para texto, visão e geração de imagem.  
**Pagamentos:** adapter de provedor; implementação inicial com um PSP que suporte assinatura no Brasil, sem acoplar regras de negócio ao fornecedor.  
**Deploy:** VPS Linux + Docker Compose + Caddy para reverse proxy e HTTPS, conforme `INFRAESTRUTURA_PRODUCAO_CLOSET.md`.  
**Observabilidade:** logs estruturados, rastreamento de erros e métricas de uso/custo por operação de IA.

### 5.2 Por que essa arquitetura
- Baixa complexidade operacional para a V1.
- Boa experiência mobile sem depender de app nativo no lançamento.
- Crescimento progressivo sem reescrever o banco.
- Segurança de dados via RLS.
- Fácil medição de custo de IA por cliente e funcionalidade.
- Permite posterior criação de apps iOS/Android consumindo as mesmas APIs.

## 6. Modelo de dados

Entidades principais:

- `profiles`
- `style_profiles`
- `style_preferences`
- `user_corrections`
- `closet_items`
- `closet_item_photos`
- `looks`
- `look_items`
- `look_feedback`
- `wear_events`
- `events_calendar`
- `ai_assessments`
- `shopping_assessments`
- `trends`
- `trend_segments`
- `partners`
- `partner_offers`
- `partner_clicks`
- `subscriptions`
- `user_modules`
- `ai_usage`
- `referrals`
- `referral_rewards`
- `consents`
- `audit_log`

### 6.1 Estados de confiança
- CONFIRMED
- OBSERVED
- INFERRED
- UNKNOWN
- OUTDATED

### 6.2 Estados de peças
- ACTIVE
- EVALUATION
- ALTERATION
- LOANED
- DONATED
- SOLD
- DISCARDED

### 6.3 Estados de looks
- SUGGESTED
- PHOTOGRAPHED
- APPROVED
- WORN
- REJECTED
- OUTDATED

## 7. Regras centrais de IA

### 7.1 Hierarquia de verdade
1. Correção explícita e recente da cliente.
2. Informação confirmada atual.
3. Feedback real de uso/conforto.
4. Foto real atual.
5. Registro estruturado responsável.
6. Histórico anterior.
7. Inferência.

### 7.2 Regras de fala
- Nunca afirmar material, marca, tamanho, preço, qualidade ou composição se não houver evidência.
- Quando a evidência for visual, usar linguagem de aparência: “parece”, “aparenta”, “há sinais de”.
- Não elogiar automaticamente.
- Criticar de forma útil e acionável.
- Ajustar o tom (direto, delicado ou detalhado) sem alterar a conclusão técnica.

### 7.3 Seleção de look
Considerar, quando disponível: ocasião, horário, clima, formalidade, perfil, conforto, identidade, cores, peças ativas, histórico recente, repetições, feedbacks, objetivos e tendência.

### 7.4 Compra
Antes de recomendar compra:
1. avaliar adequação à cliente;
2. buscar equivalentes no closet;
3. medir potencial de combinações;
4. avaliar apenas qualidade observável;
5. emitir recomendação em uma das quatro classes: EU COMPRARIA / COMPRARIA SE... / NÃO É PRIORIDADE / EU NÃO COMPRARIA.

## 8. Experiência de personalização adaptativa

A anamnese gera dois perfis separados:

1. **Perfil de estilo** — utilizado nas decisões de moda.
2. **Perfil de experiência** — controla paleta visual, tom de comunicação, densidade das explicações e ênfases da Home.

A estrutura de navegação permanece consistente entre clientes; a identidade visual pode variar em tokens de cor, ilustrações, capas e linguagem.

## 9. Design system

### 9.1 Direção
- Premium, feminino, sofisticado, leve.
- Fundo claro, muito espaço em branco.
- Fotos grandes.
- Cards arredondados.
- Tipografia editorial para títulos + sans-serif legível para interface.
- Poucos elementos por tela.
- Hierarquia: foto → nome da peça/look → informação → ação.

### 9.2 Componentes essenciais
- `PrimaryButton`
- `SecondaryButton`
- `ItemCard`
- `LookCard`
- `TrendCard`
- `PartnerOfferCard`
- `AssessmentBadge`
- `ConfidenceBadge`
- `BottomNavigation`
- `ImageUploader`
- `AIProgressState`
- `ReferralProgress`
- `PaywallModuleCard`

## 10. Mapa de telas

### Onboarding
ONB-01 Boas-vindas  
ONB-02 Cadastro/Login  
ANA-01 a ANA-13 Anamnese + revelação

### Closet
CLO-01 Adicionar peças  
CLO-02 Captura  
CLO-03 Identificação  
CLO-04 Revisão em lote  
CLO-05 Confirmação  
CLO-06 Grade  
CLO-07 Detalhe  
CLO-08 Histórico

### Home
HOM-01 Home personalizada

### Stylist
STY-01 Entrada  
STY-02 Contexto  
STY-03 Resultado  
STY-04 Trocar peça

### Avaliação
AVL-01 Foto  
AVL-02 Resultado  
AVL-03 Alternativa  
AVL-04 Decisão

### Looks
LOK-01 Meus Looks  
LOK-02 Detalhe  
USE-01 Pós-uso

### Compartilhamento
SHR-01 Criar post  
SHR-02 Prévia  
SHR-03 Formato  
SHR-04 Indicação

### Tendências
TRE-01 Radar  
TRE-02 Detalhe  
TRE-03 Tenho isso?  
TRE-04 Onde comprar

### Premium
PRE-01 Planos  
COR-01 Coloração  
COR-02 Dossiê  
EST-01 Assinatura de Estilo  
PSH-01 Personal Shopping  
PSH-02 Resultado  
MLA-01 Mala  
CST-01 Closet Estratégico

### Perfil/Indicação
PRF-01 Perfil  
PRF-02 Evolução  
PRF-03 Conquistas  
IND-01 Clube  
IND-02 Recompensa

## 11. Administração

### 11.1 Clientes
- status, plano, módulos, consumo de IA, armazenamento e consentimentos.

### 11.2 Tendências
- nome, categoria, descrição, imagens, validade, público/contexto, status.

### 11.3 Parceiros
- loja, contato, campanha, cupom, validade, link, comissão, categoria, status.

### 11.4 Campanhas
- tendência → peça/categoria → parceiro → oferta/cupom.

### 11.5 Métricas
- clientes ativas;
- conversão teste → pago;
- retenção;
- uso da Stylist;
- avaliações de look;
- peças cadastradas;
- looks usados;
- compartilhamentos;
- indicações;
- cliques e conversões de parceiros;
- custo de IA por funcionalidade e plano.

## 12. Monetização

### 12.1 Estrutura
- Teste gratuito limitado.
- Assinatura Closet Inteligente.
- Premium.
- Módulos adicionais.
- Créditos extras de geração de imagem/IA quando necessário.
- Parcerias/afiliados claramente identificados.

### 12.2 Clube de indicações
- 1 conversão: pequeno bônus de IA.
- 3: recompensa intermediária.
- 5: acesso temporário Premium/módulo.
- 10: escolha de prêmio especial, como mês grátis ou módulo por período definido.
- Contagem somente após conversão válida/paga e regras antifraude.

## 13. Privacidade e LGPD

- Consentimento granular para fotos e divulgação.
- Buckets privados e URLs temporárias.
- RLS em todas as tabelas de cliente.
- Separação entre dado operacional e material promocional.
- Exclusão de foto, peça e conta.
- Registro de consentimento e revogação.
- Exportação dos dados da cliente em fase apropriada.
- Auditoria de ações administrativas.
- Política de retenção definida antes do lançamento público.

## 14. Segurança

- RLS por padrão.
- Não confiar em `user_id` enviado pelo cliente; derivar da sessão.
- Upload com validação de tipo/tamanho.
- Remoção/normalização de metadados sensíveis de imagem quando aplicável.
- Rate limiting em IA, upload e autenticação.
- Segredos apenas no servidor.
- Logs sem conteúdo íntimo desnecessário.
- Separação de ambiente dev/staging/prod.

## 15. Orquestração de IA e controle de custo

Toda operação de IA recebe um `operation_type` e gera um registro de custo estimado/real.

Exemplos:
- `item_classification`
- `look_generation_text`
- `look_assessment_vision`
- `look_image_generation`
- `shopping_assessment`
- `color_analysis`
- `trend_personalization`

O sistema deve:
- evitar enviar o closet inteiro ao modelo quando não necessário;
- recuperar apenas peças candidatas;
- usar cache para descrições estáveis;
- separar geração de imagem de recomendação textual;
- bloquear gastos acima de limites por plano;
- oferecer fallback textual quando o limite de imagem acabar.

## 16. Fluxos críticos e critérios de aceite

### 16.1 Cadastro de peça
**Dado** que a cliente está autenticada, **quando** envia uma foto, **então** a IA sugere categoria/cor/código sem salvar como confirmado até a cliente revisar.  
**Aceite:** nenhuma peça pode ser atribuída a outra conta; código é único por conta/categoria; dados incertos permanecem vazios ou inferidos.

### 16.2 Criar look
**Dado** um closet com peças ativas, **quando** a cliente solicita um look, **então** o resultado usa apenas peças confirmadas/ativas, salvo quando a interface sinalizar explicitamente que uma sugestão externa é compra potencial.  
**Aceite:** cada item exibido referencia `closet_item_id` real.

### 16.3 Avaliar look
**Dado** uma foto real, **quando** a análise é concluída, **então** a resposta diferencia observação de inferência e oferece ação prática.  
**Aceite:** nenhuma afirmação de composição/qualidade não observável como fato.

### 16.4 Tendência e parceiro
**Dado** uma tendência ativa, **quando** a cliente abre o detalhe, **então** o app verifica o closet antes de exibir compra como ação principal.  
**Aceite:** conteúdo patrocinado/parceiro é rotulado.

### 16.5 Compartilhar look
**Dado** um look e foto real, **quando** a cliente gera a arte, **então** o app cria formato social e só usa a imagem em canais da empresa se houver consentimento específico.

## 17. Roadmap de implementação

### Fase 0 — Fundação
- projeto, ambientes, autenticação, banco, storage, design tokens, observabilidade.

### Fase 1 — Onboarding + Closet
- anamnese, perfil adaptativo, upload, identificação, CRUD de peças, grid/detalhe.

### Fase 2 — Stylist + Looks
- geração de look, salvar, usar, histórico e feedback.

### Fase 3 — Avaliação sincera
- visão, classificação, alternativas do closet e aprendizado.

### Fase 4 — Compartilhamento + indicação
- gerador de arte, links/códigos, progressão e recompensas.

### Fase 5 — Tendências + parceiros
- CMS admin, personalização, cupons, tracking.

### Fase 6 — Premium
- coloração, assinatura de estilo, shopping+, closet estratégico e mala.

### Fase 7 — Beta fechado
- Ilka como cliente #1, depois pequeno grupo externo, correções e instrumentação.

### Fase 8 — Publicação
- produção, termos, privacidade, suporte, cobrança, monitoramento e rotina de atualização de tendências.

## 18. Definition of Done para a V1

A V1 só deve ser considerada pronta quando:
- cadastro/login e recuperação funcionam;
- isolamento de dados foi testado;
- anamnese persiste e pode ser editada;
- peça pode ser adicionada, corrigida, editada e excluída;
- Stylist nunca inventa peça possuída;
- look pode ser salvo/usado/avaliado;
- avaliação sincera funciona com linguagem calibrada;
- compartilhamento respeita consentimento;
- tendências podem ser atualizadas pelo admin sem deploy;
- custo de IA é mensurável por operação e cliente;
- assinatura/limites são aplicáveis;
- logs e erros são monitorados;
- fluxo mobile foi validado em aparelhos reais;
- política de privacidade/termos e processo de exclusão estão publicados.

## 19. Backlog pós-V1

- Agenda/calendário completo.
- Capsule builder avançado.
- Estatística de custo por uso.
- Portal de parceiros.
- Comunidade.
- Skin Care.
- Cronogramas.
- Apps nativos.
- Integrações externas de catálogo/e-commerce.

## 20. Decisões que permanecem abertas

1. Nome jurídico/comercial final da solução.
2. Preços e limites de IA por plano.
3. Provedor de pagamento definitivo.
4. Política de retenção de fotos e logs.
5. Método e disclaimer definitivo de Coloração Pessoal assistida por imagem.
6. Critérios de comissão/parceria e tracking de conversão.
7. Regras exatas de recompensa do Clube de Indicações.

Essas decisões não impedem iniciar a construção da fundação e da V1.
