<script setup lang="ts">
import {ref,computed,onMounted,watch} from 'vue';
import {RouterLink} from 'vue-router';
import {configured} from '../lib/supabase';
import {price,money,imageUrl,whatsapp,logoDefault,heroDefault,listEcommerceProducts,ecommerceCategories,type Product,type Category} from '../lib/catalog';
const products=ref<Product[]>([]),cats=ref<Category[]>([]),error=ref(''),loading=ref(true),search=ref(''),category=ref('all');
onMounted(async()=>{
  if(!configured){error.value='Conexão Supabase não configurada. Confira as variáveis públicas da Vercel e publique novamente.';loading.value=false;return;}
  try{
    const p=await listEcommerceProducts();products.value=p;cats.value=ecommerceCategories(p);
  }catch(e){error.value=e instanceof Error?e.message:String(e);}finally{loading.value=false;}
});
const sort=ref('featured'), limit=ref(24);
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ');
const filtered=computed(()=>{
 const words=normalize(search.value).split(/\s+/).filter(Boolean);
 const result=products.value.filter(p=>(category.value==='all'||(p.categorias||[p.categoria]).includes(category.value))&&words.every(w=>normalize([p.nome,p.categoria,p.descricao,...(p.categorias||[])].join(' ')).includes(w)));
 return result.sort((a,b)=>sort.value==='low'?price(a)-price(b):sort.value==='high'?price(b)-price(a):sort.value==='name'?a.nome.localeCompare(b.nome,'pt-BR'):Number(b.destaque)-Number(a.destaque));
});
watch([search,category,sort],()=>{limit.value=24});
const visible=computed(()=>filtered.value.slice(0,limit.value));
function clear(){search.value='';category.value='all';sort.value='featured';}
function selectCategory(term:string){clear();search.value=term;document.getElementById('produtos')?.scrollIntoView({behavior:'smooth'});}

const phone='5519993614366';
</script>
<template>
<header class="header shopping-header">
  <div class="container header-inner">
    <RouterLink to="/" class="brand"><img :src="logoDefault" alt="Logo Shopping de Flores"/><span>Shopping <strong>de Flores</strong></span></RouterLink>
    <nav class="shopping-desktop-nav" aria-label="Navegação do Shopping de Flores">
      <a href="#produtos">Flores e presentes</a>
      <button class="nav-filter" @click="selectCategory('buque')">Buquês</button>
      <button class="nav-filter" @click="selectCategory('cesta')">Cestas</button>
      
      
      <a :href="whatsapp(phone,'Olá! Gostaria de ajuda com o catálogo.')" target="_blank" rel="noopener">Fale conosco</a>
    </nav>
    <a class="cart-button shopping-cart-link" :href="whatsapp(phone,'Olá! Gostaria de ajuda com meu pedido.')" target="_blank" rel="noopener"> <span>Atendimento</span> ↗</a>
  </div>
</header>
<nav class="shopping-mobile-nav" aria-label="Atalhos do catálogo">
  <a href="#produtos" @click="clear"><span aria-hidden="true">⌂</span>Catálogo</a>
  <button @click="selectCategory('buque')"><span aria-hidden="true">✿</span>Buquês</button>
  <button @click="selectCategory('cesta')"><span aria-hidden="true">♡</span>Cestas</button>
  <a :href="whatsapp(phone,'Olá! Gostaria de ajuda com o catálogo.')" target="_blank" rel="noopener"><span aria-hidden="true">↗</span>Atendimento</a>
</nav>
<main class="storefront"><section class="hero"><div class="container hero-grid"><div class="hero-copy"><div class="eyebrow">SHOPPING DE FLORES · CATÁLOGO DIGITAL</div><h1>Flores para <em>momentos inesquecíveis.</em></h1><p>Celebre, surpreenda e demonstre carinho. Escolha suas flores favoritas e finalize seu pedido aqui mesmo, com Pix ou cartão.</p><a class="btn primary" href="#produtos">Descobrir presentes <span>↗</span></a><div class="muted">Feito com carinho, para quem faz a vida florescer.</div></div><img :src="heroDefault" alt="Flores do Shopping de Flores" class="hero-photo"/></div></section>
<div class="store-benefits container"><span>✦ Flores e presentes</span><span>✓ Pagamento via Pix ou cartão</span><span>♡ Mensagem personalizada</span></div><section id="produtos" class="container section"><div class="eyebrow">ESCOLHAS ESPECIAIS</div><h2>Um gesto que <em>floresce.</em></h2><p class="subtitle">Encontre o presente perfeito para cada ocasião.</p><div class="filters"><input v-model="search" placeholder="Buscar buquês, flores e presentes..." aria-label="Buscar produtos"/><select v-model="category" aria-label="Filtrar categoria"><option value="all">Todas as categorias</option><option v-for="c in cats" :key="c.id" :value="c.id">{{c.nome}}</option></select><select v-model="sort" aria-label="Ordenar produtos"><option value="featured">Destaques</option><option value="low">Menor preço</option><option value="high">Maior preço</option><option value="name">Nome A–Z</option></select></div><div v-if="!loading && !error" class="result-bar"><span aria-live="polite">{{filtered.length}} produtos</span><button v-if="search || category!=='all' || sort!=='featured'" class="text-button" @click="clear">Limpar filtros</button></div><p v-if="loading" class="notice">Carregando catálogo...</p><p v-if="error" class="notice error">{{error}}</p><p v-else-if="!loading && !filtered.length" class="notice">Nenhum produto encontrado nesta seleção.</p><div class="products"><article v-for="p in visible" :key="p.id" class="product"><RouterLink :to="`/catalogo/produto/${p.slug||p.id}`" class="product-photo"><img v-if="p.imagem_url" :src="imageUrl(p.imagem_url)" :alt="p.nome" loading="lazy"/><div v-else class="placeholder">🌷</div><span v-if="p.preco_promocional&&p.preco_promocional<p.preco" class="offer">OFERTA</span></RouterLink><div class="eyebrow tiny">{{p.categoria||cats.find(c=>c.id===p.categoria_id)?.nome||'FLORES'}}</div><RouterLink :to="`/catalogo/produto/${p.slug||p.id}`" class="product-name">{{p.nome}}</RouterLink><div class="price"><strong>{{money(price(p))}}</strong><del v-if="price(p)<p.preco">{{money(p.preco)}}</del></div><RouterLink class="btn primary full" :to="`/checkout/${p.id}`">Escolher presente →</RouterLink></article></div><button v-if="limit<filtered.length" class="btn outline load-more" @click="limit+=24">Ver mais produtos</button></section>
<section class="banner"><div class="container"><div class="eyebrow">TUDO PARA MOMENTOS INESQUECÍVEIS</div><h2>O carinho mora nos <em>detalhes.</em></h2><a class="btn primary" :href="whatsapp(phone,'Olá! Gostaria de escolher um presente especial.')" target="_blank" rel="noopener">Conversar com a equipe ↗</a></div></section><footer class="footer"><div class="container"><strong>Shopping de Flores</strong><p>Tudo para momentos inesquecíveis.</p><small>© {{new Date().getFullYear()}} Shopping de Flores</small></div></footer></main>
</template>
