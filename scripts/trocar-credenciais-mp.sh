#!/usr/bin/env bash
# Troca o Access Token e o segredo do webhook do Mercado Pago no servidor SEM mostrar nem gravar os valores em lugar nenhum
# alem do .env (permissao 600). Rode no servidor, a partir da pasta do projeto:
#   ssh -t -i ~/.ssh/desenvolva_flow_hetzner root@2.29.37.142 "cd /opt/closet-inteligente && git pull -q && bash scripts/trocar-credenciais-mp.sh"
# (o -t e necessario para a digitacao ficar escondida).
set -euo pipefail
cd "$(dirname "$0")/.."

read -rsp "Novo Access Token de PRODUCAO do Mercado Pago (comeca com APP_USR-): " TOKEN; echo
read -rsp "Novo segredo do webhook (Assinatura secreta): " SECRET; echo

if [[ "$TOKEN" != APP_USR-* ]]; then echo "Esse nao parece um token de producao (deve comecar com APP_USR-). Nada foi alterado."; exit 1; fi
if [[ ${#SECRET} -lt 16 ]]; then echo "O segredo do webhook parece curto demais. Nada foi alterado."; exit 1; fi

cp .env ".env.bak-$(date +%Y%m%d-%H%M%S)"
T="$TOKEN" S="$SECRET" awk 'BEGIN{FS=OFS="="}
  $1=="MERCADOPAGO_ACCESS_TOKEN"{print $1,ENVIRON["T"]; next}
  $1=="MERCADOPAGO_WEBHOOK_SECRET"{print $1,ENVIRON["S"]; next}
  {print}' .env > .env.new
chmod 600 .env.new && mv .env.new .env
unset TOKEN SECRET

docker compose up -d web
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://localhost:3000/health/ready 2>/dev/null || curl -fsS -o /dev/null https://closet.desenvolvacontabil.com.br/health/ready; then echo "App no ar com as novas credenciais."; break; fi
  sleep 3
done
echo "Pronto. Depois de conferir um pagamento de teste, apague os backups antigos: rm .env.bak-*"
