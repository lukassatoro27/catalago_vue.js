-- Execute no SQL Editor do Supabase de destino. Não executa migração de dados.
-- Este schema é ISOLADO do e-commerce principal; use tabelas existentes somente após validar.
create extension if not exists pgcrypto;
create or replace function public.catalogo_updated_at() returns trigger language plpgsql as $$begin new.updated=now();return new;end;$$;
create table if not exists public.digital_catalog_admins(user_id uuid primary key references auth.users(id) on delete cascade, created timestamptz default now());
create or replace function public.catalogo_is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.digital_catalog_admins where user_id=(select auth.uid()))$$;
revoke all on function public.catalogo_is_admin() from public;
grant execute on function public.catalogo_is_admin() to authenticated, anon;
create table if not exists public.digital_catalog_categories(id uuid primary key default gen_random_uuid(),nome text not null,slug text not null default '',imagem_url text default '',ativo boolean not null default true,ordem int not null default 0,created timestamptz default now(),updated timestamptz default now());
create table if not exists public.digital_catalog_products(id uuid primary key default gen_random_uuid(),nome text not null,slug text not null default '',descricao text default '',categoria text default '',categoria_id uuid references public.digital_catalog_categories(id) on delete set null,preco numeric(12,2) not null default 0 check(preco>=0),preco_promocional numeric(12,2) check(preco_promocional>=0),imagem_url text default '',imagem_2_url text default '',imagem_3_url text default '',ativo boolean not null default true,destaque boolean not null default false,instagram_destaque boolean not null default false,ordem int default 0,created timestamptz default now(),updated timestamptz default now());
create table if not exists public.digital_catalog_banners(id uuid primary key default gen_random_uuid(),titulo text default '',subtitulo text default '',imagem_desktop text default '',imagem_mobile text default '',link text default '',texto_botao text default '',ativo boolean not null default true,ordem int default 0,created timestamptz default now(),updated timestamptz default now());
create table if not exists public.digital_catalog_settings(id uuid primary key default gen_random_uuid(),whatsapp_vendas text default '',nome_empresa text default 'Shopping de Flores',nome_equipe text default '',instagram text default '',logo_url text default '',texto_topo text default '',texto_secundario text default '',texto_whatsapp text default '',entrega_expressa boolean not null default false,ativo boolean not null default true,created timestamptz default now(),updated timestamptz default now());
create table if not exists public.fretes_cidades(id uuid primary key default gen_random_uuid(),cidade text not null,custo numeric(12,2) not null default 0,custo_expresso numeric(12,2) not null default 0,estrategia text not null default 'cobrar_valor' check(estrategia in ('invisivel_gratis','cobrar_valor','gratis')),status text not null default 'ativo' check(status in ('ativo','inativo')),created timestamptz default now(),updated timestamptz default now());
create table if not exists public.black_friday_promos(id uuid primary key default gen_random_uuid(),produto uuid unique references public.digital_catalog_products(id) on delete cascade,preco_promocional numeric(12,2) not null default 0,data_inicio timestamptz,data_fim timestamptz,ativo boolean default false,quantidade int default 0,vendidos int default 0,destaque boolean default false,created timestamptz default now(),updated timestamptz default now());
create table if not exists public.pedidos(id uuid primary key default gen_random_uuid(),codigo text unique,cliente_nome text,cliente_email text,cliente_telefone text,itens jsonb not null default '[]'::jsonb,subtotal numeric(12,2) default 0,frete numeric(12,2) default 0,total numeric(12,2) default 0,cidade text,endereco text,periodo_entrega text,cartinha text,origem text check(origem in ('whatsapp','mercado_pago')),status text not null default 'aberto' check(status in ('aberto','aguardando_pagamento','pago','cancelado','estornado')),criado_por uuid references auth.users(id),created timestamptz default now(),updated timestamptz default now());
create table if not exists public.pagamentos(id uuid primary key default gen_random_uuid(),pedido_id uuid references public.pedidos(id) on delete restrict,mercado_pago_payment_id text,status text,valor numeric(12,2),raw_payload jsonb,created timestamptz default now(),updated timestamptz default now());
create index if not exists idx_digital_catalog_products_ativo_ordem on public.digital_catalog_products(ativo,ordem);
create index if not exists idx_digital_catalog_products_slug on public.digital_catalog_products(slug);
create index if not exists idx_digital_catalog_categories_ativo_ordem on public.digital_catalog_categories(ativo,ordem);
create index if not exists idx_pedidos_created on public.pedidos(created desc);
-- Proteção RLS: leitura pública limitada a itens ativos; administrador cadastrado pode gerenciar.
do $$declare t text;begin foreach t in array array['digital_catalog_admins','digital_catalog_categories','digital_catalog_products','digital_catalog_banners','digital_catalog_settings','fretes_cidades','black_friday_promos','pedidos','pagamentos'] loop execute format('alter table public.%I enable row level security',t);end loop;end$$;
drop policy if exists catalog_admin_self on public.digital_catalog_admins;
create policy catalog_admin_self on public.digital_catalog_admins for select to authenticated using(user_id=(select auth.uid()));
-- Não existe política pública de INSERT/UPDATE na tabela de admins. Cadastre no SQL Editor.
do $$declare t text;begin foreach t in array array['digital_catalog_categories','digital_catalog_products','digital_catalog_banners','digital_catalog_settings','fretes_cidades','black_friday_promos','pedidos','pagamentos'] loop
execute format('drop policy if exists catalog_admin_all on public.%I',t);
execute format('create policy catalog_admin_all on public.%I for all to authenticated using ((select public.catalogo_is_admin())) with check ((select public.catalogo_is_admin()))',t);
end loop;end$$;
drop policy if exists catalog_public_products on public.digital_catalog_products;
create policy catalog_public_products on public.digital_catalog_products for select to anon,authenticated using(ativo=true);
drop policy if exists catalog_public_categories on public.digital_catalog_categories;
create policy catalog_public_categories on public.digital_catalog_categories for select to anon,authenticated using(ativo=true);
drop policy if exists catalog_public_banners on public.digital_catalog_banners;
create policy catalog_public_banners on public.digital_catalog_banners for select to anon,authenticated using(ativo=true);
drop policy if exists catalog_public_settings on public.digital_catalog_settings;
create policy catalog_public_settings on public.digital_catalog_settings for select to anon,authenticated using(ativo=true);
drop policy if exists catalog_public_fretes on public.fretes_cidades;
create policy catalog_public_fretes on public.fretes_cidades for select to anon,authenticated using(status='ativo');
drop policy if exists catalog_public_blackfriday on public.black_friday_promos;
create policy catalog_public_blackfriday on public.black_friday_promos for select to anon,authenticated using(ativo=true and data_inicio<=now() and data_fim>=now());
-- Storage público apenas para leitura. Escrita exclusiva de administrador autenticado.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('catalogo','catalogo',true,8388608,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists catalogo_storage_read on storage.objects;
create policy catalogo_storage_read on storage.objects for select to anon,authenticated using(bucket_id='catalogo');
drop policy if exists catalogo_storage_insert on storage.objects;
create policy catalogo_storage_insert on storage.objects for insert to authenticated with check(bucket_id='catalogo' and (select public.catalogo_is_admin()));
drop policy if exists catalogo_storage_update on storage.objects;
create policy catalogo_storage_update on storage.objects for update to authenticated using(bucket_id='catalogo' and (select public.catalogo_is_admin())) with check(bucket_id='catalogo' and (select public.catalogo_is_admin()));
drop policy if exists catalogo_storage_delete on storage.objects;
create policy catalogo_storage_delete on storage.objects for delete to authenticated using(bucket_id='catalogo' and (select public.catalogo_is_admin()));
-- Criar seu usuário pelo Auth > Users e, em seguida, liberar acesso:
-- insert into public.digital_catalog_admins(user_id) values ('UUID-DO-USUARIO-DO-AUTH') on conflict do nothing;
-- Não exponha tokens de service_role, segredos do Mercado Pago ou senha de banco no Vite.
