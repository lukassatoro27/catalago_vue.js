# Shopping de Flores — Catálogo Vue 3 + Supabase

## Escopo entregue

Nova aplicação com **Vue 3 + Composition API + TypeScript + Vue Router + Vite**, substituindo React/React Router no frontend. Integração com **Supabase JS**, autenticação via Supabase Auth, autorização com **Row Level Security (RLS)** e painel administrativo para produtos, categorias, banners, destaques, configurações, fretes e Black Friday. Visualização de pedidos/pagamentos. O catálogo tem busca, filtros, detalhes de produtos, sacola persistente, cálculo de frete e encaminhamento do pedido via WhatsApp. Design responsivo nas cores da marca.

**Importante:** esta é uma reconstrução funcional dos fluxos principais, **não uma migração 1:1 de todas as telas, integrações e dados**. O ZIP original usa React Router + PocketBase. Sem export dos registros reais, arquivos de storage e credenciais do Supabase de destino, não é possível migrar os dados nem afirmar que os dados já estejam conectados. O checkout Mercado Pago, webhooks, tracking e a lógica server-side original **não foram portados**. A opção de finalizar no frontend atual abre o WhatsApp; não processa pagamentos. Não publicar como substituto integral antes da homologação.

## 1. Configuração

1. No Supabase de destino, abra **SQL Editor** e execute `supabase/schema.sql` **somente após revisar os nomes das tabelas para evitar conflitos** com um projeto Supabase existente.
2. Em **Authentication > Users**, crie/convide o usuário administrador.
3. Execute no SQL Editor (substituindo o UUID):

   `insert into public.digital_catalog_admins (user_id) values ('UUID_DO_USUARIO') on conflict do nothing;`

4. Copie `.env.example` para `.env` e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave publicável/anon).
5. Rode `npm install` e `npm run dev` para desenvolver. `npm run build` gera `dist/` para Vercel. Configure as duas variáveis em Vercel > Project Settings > Environment Variables.

## 2. URLs

- `/` e `/catalogo` — catálogo público
- `/catalogo/produto/:slug` — produto
- `/admin/catalogo/login` — login
- `/admin/catalogo` — visão geral
- `/admin/catalogo/produtos`, `/categorias`, `/banners`, `/destaques`, `/configuracoes`, `/fretes`, `/black-friday`, `/pedidos`, `/pagamentos` — gestão

## 3. Migrando dados do PocketBase

O banco original **não está incluído como um dump de registros**. A pasta `apps/pocketbase` do projeto enviado contém migrations e imagens de seed, mas isso não comprova presença dos registros atuais. Procedimento recomendado:

1. Fazer backup da instância PocketBase original, incluindo coleções e arquivos, com autorização.
2. Exportar registros atuais para JSON/CSV por coleção.
3. Importar na ordem: categorias → produtos → banners → configurações → fretes → Black Friday → pedidos → pagamentos.
4. Preservar associação de categorias, IDs anteriores (ou produzir tabela de equivalência UUID), links e caminhos de imagem; copiar os arquivos de storage para o bucket `catalogo`. O helper `imageUrl()` aceita URL https ou caminho dentro do bucket.
5. Para Supabase já usado por outros aplicativos, reconciliar schemas em vez de executar migrations cegamente. Aplicar RLS e fazer testes com usuário visitante e admin.

## 4. Pontos críticos de segurança e homologação

- Nunca colocar `service_role`, `sb_secret`, credenciais do Mercado Pago ou outros segredos no `.env` do frontend nem no Git.
- A tabela `digital_catalog_admins` tem autorização por UUID de Supabase Auth. Não há criação pública de administradores.
- A RLS protege gravações administrativas e informações de pedidos/pagamentos.
- A gravação de pedidos com valores deve ser feita **server-side**, com cálculo de preço e frete no servidor (não confiar no carrinho do navegador).
- Webhook Mercado Pago deve validar notificação via backend/Edge Function e ser idempotente antes de marcar pagamento.
- Auditoria pendente: funcionamento completo de todos os campos herdados, dados reais, imagens, pixels/GA4/GTM, Black Friday e dashboards.

## 5. Sobre os componentes originais

O original possui vários componentes Radix/shadcn específicos de React e serviços de PocketBase. Eles não podem ser copiados diretamente como componentes Vue. O novo frontend oferece implementações Vue nativas dos fluxos centrais; os recursos avançados exigem migração individual e testes.
