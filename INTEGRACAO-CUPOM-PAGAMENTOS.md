# Integração Shopping de Flores → Catálogo Vue

## Implementado no ZIP
- Cupom no checkout Vue aplicado/removido e revalidado ao confirmar, usando a regra original de desconto sobre produtos + frete.
- `create_order` recebe `coupon_code`, `discount_amount`, `subtotal` e `p_total_amount` conforme checkout principal.
- Checkout só abre o pagamento após ler e comparar `orders.total_amount` e metadados persistidos pelo servidor. Se leitura estiver bloqueada por RLS, não permite pagamento e mostra o ID do pedido.
- Pix/cartão enviam o total confirmado do pedido; `check-payment-status` permanece.
- Migração SQL de exemplo para validar desconto no banco, baseada no snapshot original do e-commerce.
- Cópias das Edge Functions de pagamento com proteção contra valores divergentes, para revisão e deploy.

## IMPORTANTE: NÃO ESTÁ PRONTO PARA COBRAR COM CUPOM SEM APLICAÇÃO DO BACKEND
1. Conferir `SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_order';` contra `supabase/migrations/20261123_catalog_coupon_server_validation_REVIEW.sql`. NÃO aplicar a migração diretamente sem conciliar alterações recentes: a função é compartilhada.
2. Implantar regra de cupom validada no banco; verificar RLS de leitura de `orders` para que o próprio comprador possa conferir o pedido sem revelar pedidos de outros.
3. Somente depois de validar a proteção no backend, configurar `VITE_CATALOG_COUPON_BACKEND_READY=true` no ambiente de deploy do Vue (padrão é falso, e o pagamento com cupom fica bloqueado). Fazer code review/testes/deploy das funções em `supabase/functions/process-payment` e `supabase/functions/generate-pix`. As versões locais são snapshots da origem, não prova de que correspondem às atualmente publicadas.
4. Criar consumo idempotente de `use_count` no webhook em evento de pagamento aprovado, com conciliação de estorno/cancelamento, se a contagem de uso do cupom for necessária. O snapshot não o implementa.
5. Verificar correspondência da regra de frete embutido do catálogo e do site; este projeto mantém o cálculo original (frete separado).
6. Testar cenário sem cupom e com cupom válido, expirado, desativado, limite atingido, desconto maior que total, alteração de preço/CEP, pedido repetido e falha no provedor.

Não publique secrets (`service_role`, token Mercado Pago) em variáveis `VITE_`.
