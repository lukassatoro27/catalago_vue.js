# Checkout Vue integrado à create_order informada em 23/11/2026

## Atualização no frontend
- Removido bloqueio `VITE_CATALOG_COUPON_BACKEND_READY`: a função atual `public.create_order` já valida o cupom com `FOR UPDATE`, confere regras, compara desconto e verifica o total. Não precisa ativar flag.
- Código do cupom, `discount_amount`, `shipping_cost` e total são enviados à RPC existente; a função calcula e confere o valor.
- Depois da RPC, o checkout tenta confirmar o pedido persistido. Pagamento só é habilitado após conferir valor, desconto e código. Se a leitura for negada por RLS, pagamento permanece bloqueado, com ID do pedido para atendimento.
- Depois da criação do pedido, mesmo se a conferência der erro, o identificador é retido para evitar cliques que criem pedidos duplicados.
- `generate-pix` usa valor confirmado pelo servidor e preserva `resume_token` dentro da sessão (a recuperação após recarregar ainda depende do fluxo oficial de `recover-checkout`).
- Cartão utiliza `process-payment`, com total persistido; status deve ser confirmado pelo backend/webhook.

## Verificações OBRIGATÓRIAS antes de produção
1. `create_order` compartilhada: a assinatura fornecida confere cupom, mas **não valida frete** (`shipping_cost` é recebido de `p_metadata`) e permite usar preços enviados pelo navegador para produto não encontrado; corrigir/avaliar no backend de produção sem interromper outros canais. Testar frete via `validate-delivery-cep` e valores de produtos; não presumir segurança integral.
2. Conferir políticas RLS para leitura de `orders` pelo cliente. Sem acesso, a conferência visual bloqueia cobrança. Não abrir SELECT global para usuários anônimos apenas para habilitar isso: preferir uma Edge Function de confirmação com autorização por token de pedido.
3. A função informada NÃO incrementa `coupons.use_count`: ativar contagem de uso atomicamente na aprovação, com idempotência do webhook, e considerar pedidos concorrentes.
4. As cópias locais de `generate-pix` e `process-payment` são snapshots de referência: **não substituir versões publicadas** sem diff/revisão. O frontend chama as funções implantadas no Supabase.
5. Mercado Pago pode rejeitar cobranças muito pequenas, como R$ 0,98. O site não deverá informar compra aprovada sem confirmação do backend. Cupom de 100% exige um fluxo próprio, que `create_order` atualmente bloqueia.
6. Testar cupons válidos, expirados, limite esgotado, alteração de preço, cancelamento, idempotência, PIX e cartão em sandbox antes de publicar.

## Como executar
`npm install` e `npm run build`. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (somente chave pública), sem guardar tokens privados do Mercado Pago no frontend.

## Não aplicar migração anterior
O arquivo SQL de exemplo antigo foi renomeado como `.sql.NAO_EXECUTAR.txt` para evitar sobregravar a função atual do Shopping de Flores, que já contém verificações mais recentes.
