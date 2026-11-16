# Catálogo Vue 3 → produtos do e-commerce 2.0

## Integração com banco existente

Este projeto lê **diretamente** a tabela `public.produtos_novo` do Supabase do e-commerce Shopping de Flores. Não cria, altera, importa ou duplica produtos. Campos mapeados: `nome`, `descricao`, `preco`, `promo_preco`, `imagem`, `imagens_adicionais`, `categorias`, `ativo`, `slug`, `destaque_loja`.

Categorias da vitrine são derivadas da coluna `categorias` (array) nos produtos ativos. O catálogo público obtém lotes de até 500 produtos por consulta. Página de produto pesquisa a tabela original por ID ou slug.

As demais áreas do painel de catálogo continuam usando as tabelas independentes `digital_catalog_*` previstas no projeto anterior. **Não use o painel Vue para tentar editar os produtos do e-commerce 2.0**; a gestão desses produtos continua no gerenciador principal. As configurações, fretes e banners do catálogo são opcionais e não bloqueiam a vitrine quando não existem, mas podem aparecer sem dados. O carrinho atual gera mensagem de WhatsApp; não é o checkout do e-commerce.

## Vercel — configurar para Production, Preview e Development conforme necessário

Adicione **exatamente** estas variáveis em Project → Settings → Environment Variables:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

Pode-se usar `VITE_SUPABASE_PUBLISHABLE_KEY` em lugar de `VITE_SUPABASE_ANON_KEY`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `NEXT_PUBLIC_SUPABASE_*` **não** são lidas automaticamente pelo Vite. Após salvá-las faça **Redeploy**. Não usar `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, JWT secret nem senha de PostgreSQL no frontend.

## Preparar a leitura dos produtos

O usuário público (`anon`) precisa ter permissão **SELECT** com RLS apenas nos produtos ativos. Consulte `supabase/LEIA-ANTES-PRODUTOS.sql`: é somente um modelo para revisão; NÃO execute sem verificar as políticas já existentes. Se houver erro 42501/permissão, solicite ao administrador do banco revisar grants e RLS. Não desative RLS para resolver.

## Instalação

```bash
npm install
npm run build
npm run dev
```

Não executar `supabase/schema.sql` em banco já em produção sem análise: aquele SQL pertence ao catálogo isolado antigo e cria tabelas distintas. Nenhuma credencial real foi embutida no ZIP.

## Validações

1. Verificar se `produtos_novo` retorna produtos ativos com chave publicável.
2. Conferir imagens já armazenadas no formato de URLs utilizado pelo e-commerce.
3. Conferir preços, promoções, links e categorias.
4. Testar detalhes por slug e UUID e verificar console/network para erros RLS.
5. Validar se o catalogo Vue está apontando para o mesmo **Project URL** do e-commerce principal.

Integração elaborada a partir do código fornecido, sem acesso ao Supabase em produção. Não foi possível confirmar volume de registros, permissões ou conteúdo real do banco remotamente.
