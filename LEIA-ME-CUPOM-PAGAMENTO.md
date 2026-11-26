# Ajuste de cupom no pagamento

Base de desconto: produtos + entrega, inclusive primeira compra, conforme pedido e SQL de referência incluído no ZIP. A Edge validate-first-purchase recebe essa base e continua validando CPF, elegibilidade e reserva. O total líquido e o desconto são enviados à create_order. A resposta autoritativa da RPC confirma valor e cupom sem depender de SELECT público em orders; consulta adicional só se a resposta for incompleta. Pix e cartão recebem exclusivamente o total confirmado.

Exemplo: produtos 100 + entrega 20, cupom 10%, desconto 12, pagamento 108.

Não executar os SQL de referência nem publicar as Edge Functions locais automaticamente. A RPC implantada e a Edge de primeira compra precisam aceitar a mesma base. O snapshot SQL não implementa todas as regras modernas (por exemplo max_discount); caso a produção use uma regra diferente, o checkout continua bloqueando divergências. Solicitar pg_get_functiondef da RPC atual para ajustar em conjunto sem retirar validações. As funções de pagamento publicadas devem usar orders.total_amount como fonte de verdade e validar autorização do pedido. Não houve acesso ao Supabase de produção ou cobrança real.
