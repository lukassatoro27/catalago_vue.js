# Correções do catálogo
- Checkout usa subtotal de produtos como base de cupom (hipótese de integração; confirmar regra real da RPC antes de publicar).
- Metadata subtotal inclui frete, conforme payload do site principal apresentado pelo usuário.
- Usuário autenticado usa ID da sessão; convidado usa null.
- Erros RPC exibidos corretamente; divergência de cupom não é ignorada.
- Layout responsivo revisado. Nenhuma migration de produção aplicada.

## Verificação obrigatória no SQL Editor (somente leitura)
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'create_order';
SELECT code, discount_type, discount_value, min_value, active FROM public.coupons WHERE upper(code) = 'PROMO998';
```
O snapshot REVIEW incluído no projeto calcula desconto sobre produtos + frete, diferentemente da hipótese desta correção. Se a função implantada usar essa regra, alinhar couponBase ao contrato real. Não executar o snapshot automaticamente. Confirmar também subtotal, frete por quantidade, acesso seguro ao retorno do pedido e funções de pagamento. Não remover validações nem habilitar cobrança sem homologação.
