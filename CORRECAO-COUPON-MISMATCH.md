# Correção do catálogo
Primeira compra usa validate-first-purchase (check, reserve e vínculo com order_id), com base nos produtos elegíveis sem frete, igual ao checkout principal fornecido. Cupom comum usa produtos + frete. O total é conferido antes do pagamento. Não há tentativa automática com valor diferente nem remoção silenciosa do desconto.
A RPC de produção não está disponível no ZIP da Shopping; a migração antiga de revisão não deve ser executada e foi movida para referência. Caso persista COUPON_MISMATCH, consultar no SQL Editor (somente leitura):
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'create_order';
```
É necessário comparar a base de cálculo e arredondamento dessa função com a autorização real. Não substituir a RPC sem revisar as regras dos demais canais.
