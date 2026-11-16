# Navegação Shopping de Flores no catálogo Vue

O cabeçalho e a barra inferior mobile do catálogo incorporam atalhos para Buquês, Cestas, Cupom e Carrinho do e-commerce oficial.

- Buquês: https://shoppingdeflores.com/categoria/buques
- Cestas: https://shoppingdeflores.com/categoria/cestas
- Cupom: https://shoppingdeflores.com/carrinho#cupom
- Carrinho/Minha cesta: https://shoppingdeflores.com/carrinho

O componente CouponField.jsx fica no projeto React do Shopping de Flores e valida cupons com contexto próprio; ele não foi copiado para Vue. Um cupom só pode ser validado e aplicado no checkout/carrinho oficial. O fragmento #cupom é um atalho de URL: para rolar automaticamente ao campo, o carrinho React precisa ter um elemento com id="cupom". Sem esse ajuste, o link abre o carrinho normalmente. O conteúdo do carrinho NÃO é sincronizado entre domínios.

Teste os links no ambiente publicado e verifique eventuais mudanças nas rotas do Shopping principal.
