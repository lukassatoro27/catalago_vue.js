# Checkout integrado no Vue

A nova rota `/checkout/:id` executa o fluxo de pedido e pagamento DENTRO do catálogo, sem redirecionamento.

## Funções/tabelas do backend original que DEVEM estar implantadas no mesmo Supabase
- `produtos_novo`, `delivery_periods`, `orders`, RPC `create_order`
- Edge Functions: `validate-delivery-cep`, `generate-pix`, `get-mp-public-key`, `process-payment`, `check-payment-status` (opcional para consulta), `sync-ecommerce-cartinha`
- Webhooks originais do Mercado Pago e as políticas de RLS adequadas ao checkout de visitantes

## Variáveis na Vercel
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chaves publicáveis) ou os aliases já suportados pelo vite.config.ts.
- **NUNCA** inclua Mercado Pago Access Token, chave service_role ou segredo no projeto Vue.

## Avisos de homologação obrigatória antes de vender
1. Validar a assinatura e as políticas de acesso da RPC `create_order` para convidados.
2. Confirmar o retorno das Edge Functions `generate-pix`, `process-payment` e `check-payment-status` no ambiente REAL de staging.
3. Verificar cobranças e webhooks, idempotência, confirmação de pagamento, cálculo do frete e rejeição de valores manipulados no servidor.
4. Validar as regras de domingo/horários e datas, bloqueio de CEP não atendido, cartões recusados e pagamentos em análise.
5. O Vue exibe a quantidade e subtotal; os valores **devem ser validados de novo** na RPC e Edge. O layout Vue não é fonte autoritativa.
6. Não confundir status 'pendente' com pedido pago. Não disparar evento purchase antes de confirmação do backend.

A interface é uma adaptação inicial: não inclui cupons, entrega expressa, planos ou outros caminhos especiais de checkout; não publicar como checkout financeiro homologado sem testar todos os pontos.

## Segurança crítica para produção
O código original da Edge Function `process-payment` mostrado no ZIP do e-commerce usa `amount` recebido do frontend ao criar a cobrança. **Não habilite pagamentos reais antes de modificar essa Edge Function para consultar o total vigente do pedido diretamente de `orders` no servidor e recusar divergências.** A função `generate-pix` também precisa de validação equivalente. Ajustar apenas o frontend NÃO protege o valor contra manipulação.

A alteração de backend deve ser testada na aplicação principal antes de qualquer deploy de produção; este ZIP não atualiza as Edge Functions do projeto Supabase.
