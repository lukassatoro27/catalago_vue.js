# Cupom no Catálogo Vue — entrega e pendências de backend

## O que foi implementado
- Campo de cupom dentro do resumo de `/checkout/:id`.
- Reutiliza `public.coupons` da mesma instância do Supabase já configurada no Vue.
- Consultas por `.from('coupons').select(...).eq('code', CODE).maybeSingle()`, equivalentes a `GET /rest/v1/coupons?code=eq.CODIGO&select=code,discount_type,discount_value,active,expiry_date,min_value,copy_count,use_count,final_use_count`.
- Valida ativo, expiração, mínimo e quantidade de usos; calcula estimativa percentual ou fixa, e revalida após mudanças no subtotal/frete.
- Permite remover cupom, e apresenta resumo com desconto previsto e total estimado.

## ATENÇÃO — NÃO ESTÁ HABILITADA COMPRA COM CUPOM
A RPC `create_order` usada pelo checkout Vue atualmente recebe `p_total_amount` e `p_metadata.discount_amount: 0`. Não há evidência de que ela valide cupom e aplique desconto de forma atômica. A Edge `generate-pix` e `process-payment` também precisam ler o valor autorizado do pedido no backend. Portanto, o Vue bloqueia `createOrder` quando um cupom está selecionado para evitar cobranças manipuláveis ou descontos somente visuais. Sem cupom, o fluxo original continua igual.

## Próximas etapas obrigatórias no Supabase (backend do Shopping de Flores)
1. Implementar endpoint server-side de cotação do cupom (por exemplo, Edge Function `validate-catalog-coupon`) que obtenha produto/preço/frete reais e valide cupom, limites, valor mínimo e expiração usando regras oficiais. **Este nome é uma proposta, não um endpoint existente.**
2. Ajustar a criação do pedido no servidor para receber apenas o `coupon_code` e calcular **tudo** novamente, com idempotência e uso de cupom contabilizado de modo atômico no momento correto, respeitando cancelamento/falha.
3. Fazer `generate-pix` e `process-payment` calcular/consultar o total autorizado em `orders` e rejeitar `amount` divergente. Não confiar em valores do navegador.
4. Definir se o desconto inclui o frete. O `useCoupon.js` original calcula sobre produtos + adicionais + frete; manter essa regra somente se confirmada pela regra oficial de negócio.
5. Testar RLS de `coupons` para visitantes: permitir somente os campos de leitura necessários, sem permitir manipulação de ativações, contadores ou descontos. Se leitura pública for sensível, mover a consulta para a Edge Function.
6. Depois de implantar e testar esses ajustes, remover a trava `couponPendingBackend` no componente Vue e conectar o fluxo aos endpoints efetivamente implantados.

**Não inserir service_role nem segredo no frontend.** A URL do Supabase deve ser configurada via `VITE_SUPABASE_URL`, com chave publicável via `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY`.
