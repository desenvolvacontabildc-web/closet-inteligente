import { SUPPORT_URL, SUPPORT_PHONE } from "@/components/support";
export default function Privacidade(){return <main className="shell narrow">
<a href="/">← Voltar</a>
<h1>Política de Privacidade</h1>
<p><em>Versão de teste fechado — última atualização: 09/11/2026. Em conformidade com a Lei Geral de Proteção de Dados (LGPD).</em></p>

<h2>1. Quem é responsável pelos seus dados</h2>
<p>O Closet Inteligente é operado por Ilka Mariano, que atua como controladora dos dados pessoais tratados neste aplicativo, em fase de teste fechado.</p>

<h2>2. Quais dados coletamos</h2>
<ul>
<li>Número de WhatsApp, informado no cadastro, usado para enviar as boas-vindas, orientações de uso e responder dúvidas por mensagem (inclusive pela Aura, nossa assistente virtual). Nos anúncios do Bazar &amp; Aluguel, o número só é usado para abrir a conversa com quem tocar em “Chamar no WhatsApp”. Você pode trocar ou apagar o número no Perfil;</li>
<li>Nome e e-mail, para criar e identificar sua conta; a senha é guardada apenas como hash criptográfico, nunca em texto legível;</li>
<li>Respostas dos questionários que você preencher (estilo, Colorimetria, Skincare e Cronograma Capilar) e sua cidade, usada para o clima do dia;</li>
<li>Fotos que você enviar voluntariamente: das suas peças, de perfil, de looks para análise e, se você quiser, uma foto de corpo ou de rosto para gerar imagens parecidas com você e para a Colorimetria;</li>
<li>Dados de uso do aplicativo (looks gerados, etapas marcadas, limites usados) e dados da assinatura (plano, status, datas e valores);</li>
<li>Pagamentos: Pix e cartão são processados pelo Mercado Pago. Os dados do seu cartão não passam pelos nossos servidores; guardamos apenas o status e os identificadores do pagamento.</li>
</ul>

<h2>3. Para que usamos esses dados</h2>
<p>Para organizar seu closet, montar looks, analisar peças e looks, gerar imagens e rotinas de cuidado, calcular sua paleta de cores, controlar seu plano e limites, e processar pagamentos. Não vendemos seus dados e não os usamos para publicidade de terceiros.</p>

<h2>4. Com quem compartilhamos (importante: inteligência artificial)</h2>
<p>Para fazer as funções de inteligência artificial funcionarem, enviamos conteúdo seu a fornecedores:</p>
<ul>
<li><strong>OpenAI</strong> (modelos de IA): recebe textos do seu closet (nomes, categorias, cores) e <strong>as fotos necessárias para cada função</strong>. Isso acontece, por exemplo, quando você cadastra uma peça com foto (análise e foto de catálogo automáticas), pede um look em imagem, analisa um look seu, usa a Colorimetria ou responde ao Skincare e ao Cronograma Capilar. Se você enviou uma foto de corpo ou de rosto, ela é usada como referência nas imagens que você pedir com ela;</li>
<li><strong>Mercado Pago</strong>: dados necessários para cobrar (nome, e-mail e valor);</li>
<li><strong>Open-Meteo</strong>: apenas o nome da sua cidade, para mostrar o clima;</li>
<li><strong>Provedor de hospedagem</strong> do servidor onde o aplicativo roda.</li>
</ul>
<p>Alguns desses fornecedores tratam dados fora do Brasil. Não enviamos seus dados a terceiros para fins comerciais próprios deles por nossa iniciativa.</p>

<h2>5. Onde seus dados ficam armazenados</h2>
<p>Em servidor virtual contratado por nós, com fotos guardadas em armazenamento privado, sem acesso público, acessíveis apenas mediante login. Mantemos cópias de segurança diárias do banco de dados, guardadas por 14 dias, e uma cópia espelhada das fotos.</p>

<h2>6. Por quanto tempo guardamos seus dados</h2>
<p>Enquanto sua conta estiver ativa. Se você pedir o cancelamento, apagamos sua conta e seus dados; o que estiver nas cópias de segurança diárias deixa de existir quando elas forem substituídas, em até 14 dias.</p>

<h2>7. Seus direitos</h2>
<p>Conforme a LGPD, você pode a qualquer momento solicitar: acesso aos seus dados, correção de informações incorretas, exclusão da sua conta e dos seus dados, exportação dos seus dados e retirada do seu consentimento. Nesta fase de teste, isso é feito diretamente com a administradora; ainda não há botão de autoatendimento no aplicativo.</p>

<h2>8. Fotos de outras pessoas e menores de idade</h2>
<p>Este serviço não é destinado a menores de 18 anos. Envie apenas fotos suas e das suas peças. Se uma foto tiver outras pessoas, especialmente crianças, prefira recortá-la ou não enviá-la: o aplicativo não precisa delas, e a responsabilidade por ter autorização para fotos de terceiros é de quem as envia.</p>

<h2>9. Mudanças nesta política</h2>
<p>Como o aplicativo está em fase de teste, esta política pode ser atualizada. Alterações relevantes serão avisadas diretamente às usuárias.</p>

<h2>10. Contato</h2>
<p>Para exercer seus direitos ou tirar dúvidas sobre seus dados, fale com a administradora pelo WhatsApp <a href={SUPPORT_URL} target="_blank" rel="noreferrer">WhatsApp {SUPPORT_PHONE}</a>.</p>
</main>}
