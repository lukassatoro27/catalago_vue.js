<script setup lang="ts">
import {ref,computed,onMounted} from 'vue';
import {RouterLink} from 'vue-router';
import {Search, ShoppingCart, Flower2, Gift, Tag, Menu, X} from 'lucide-vue-next';
const menuOpen=ref(false);
import {configured} from '../lib/supabase';
import {price,money,imageUrl,whatsapp,logoDefault,heroDefault,listEcommerceProducts,ecommerceCategories,type Product,type Category} from '../lib/catalog';
const products=ref<Product[]>([]),cats=ref<Category[]>([]),error=ref(''),loading=ref(true),search=ref(''),category=ref('all');
onMounted(async()=>{
  if(!configured){error.value='Conexão Supabase não configurada. Confira as variáveis públicas da Vercel e publique novamente.';loading.value=false;return;}
  try{
    const p=await listEcommerceProducts();products.value=p;cats.value=ecommerceCategories(p);
  }catch(e){error.value=e instanceof Error?e.message:String(e);}finally{loading.value=false;}
});
const filtered=computed(()=>products.value.filter(p=>(category.value==='all'||p.categoria===category.value||p.categoria_id===category.value)&&p.nome.toLowerCase().includes(search.value.trim().toLowerCase())));
const phone='5519993614366';
</script>
<template>
<header class="header shopping-header">
  <div class="container header-inner">
    <button class="mobile-menu" @click="menuOpen=!menuOpen" :aria-expanded="menuOpen" aria-label="Menu"><X v-if="menuOpen"/><Menu v-else/></button><RouterLink to="/" class="brand"><img :src="logoDefault" alt="Logo Shopping de Flores"/></RouterLink>
    <div class="header-search"><Search :size="19"/><input v-model="search" placeholder="O que você está procurando?" aria-label="Buscar no catálogo"/><a href="#produtos" aria-label="Ver resultados"><Search :size="18"/></a></div>
    <nav :class="['shopping-desktop-nav', {'menu-open':menuOpen}]" aria-label="Navegação do Shopping de Flores">
      <a href="#produtos">Flores e presentes</a>
      <a href="https://shoppingdeflores.com/categoria/buques">Buquês</a>
      <a href="https://shoppingdeflores.com/categoria/cestas">Cestas</a>
      <a href="https://shoppingdeflores.com/carrinho#cupom" title="Aplicar cupom no carrinho oficial">Cupom</a>
      <a href="https://shoppingdeflores.com/carrinho" title="Abrir carrinho do Shopping de Flores">Carrinho</a>
      <a :href="whatsapp(phone,'Olá! Gostaria de ajuda com o catálogo.')" target="_blank" rel="noopener">Fale conosco</a>
    </nav>
    <a class="cart-button shopping-cart-link" href="https://shoppingdeflores.com/carrinho" aria-label="Abrir carrinho oficial"><ShoppingCart :size="24"/> <span>Carrinho</span></a>
  </div>
</header>
<nav class="shopping-mobile-nav" aria-label="Atalhos do Shopping de Flores">
  <a href="https://shoppingdeflores.com/categoria/buques"><Flower2 :size="23"/>Buquês</a>
  <a href="https://shoppingdeflores.com/categoria/cestas"><Gift :size="23"/>Cestas</a>
  <a href="https://shoppingdeflores.com/carrinho#cupom"><Tag :size="23"/>Cupom</a>
  <a href="https://shoppingdeflores.com/carrinho"><ShoppingCart :size="23"/>Carrinho</a>
</nav>
<section class="hero"><div class="container hero-grid"><div class="hero-copy"><div class="eyebrow">SHOPPING DE FLORES · CATÁLOGO DIGITAL</div><h1>Flores para <em>momentos inesquecíveis.</em></h1><p>Celebre, surpreenda e demonstre carinho. Escolha suas flores favoritas e finalize seu pedido aqui mesmo, com Pix ou cartão.</p><a class="btn primary" href="#produtos">Descobrir presentes <span>↗</span></a><div class="muted">Feito com carinho, para quem faz a vida florescer.</div></div><img :src="heroDefault" alt="Flores do Shopping de Flores" class="hero-photo"/></div></section>
<section id="produtos" class="container section"><div class="eyebrow">ESCOLHAS ESPECIAIS</div><h2>Um gesto que <em>floresce.</em></h2><p class="subtitle">Encontre o presente perfeito para cada ocasião.</p><div class="filters"><input v-model="search" placeholder="Buscar buquês, flores e presentes..." aria-label="Buscar produtos"/><select v-model="category" aria-label="Filtrar categoria"><option value="all">Todas as categorias</option><option v-for="c in cats" :key="c.id" :value="c.id">{{c.nome}}</option></select></div><p v-if="loading" class="notice">Carregando catálogo...</p><p v-if="error" class="notice error">{{error}}</p><p v-else-if="!loading && !filtered.length" class="notice">Nenhum produto encontrado nesta seleção.</p><div class="products"><article v-for="p in filtered" :key="p.id" class="product"><RouterLink :to="`/catalogo/produto/${p.slug||p.id}`" class="product-photo"><img v-if="p.imagem_url" :src="imageUrl(p.imagem_url)" :alt="p.nome" loading="lazy"/><div v-else class="placeholder">🌷</div><span v-if="p.preco_promocional&&p.preco_promocional<p.preco" class="offer">OFERTA</span></RouterLink><div class="product-info"><div class="eyebrow tiny">{{p.categoria||cats.find(c=>c.id===p.categoria_id)?.nome||'FLORES'}}</div><RouterLink :to="`/catalogo/produto/${p.slug||p.id}`" class="product-name">{{p.nome}}</RouterLink><div class="price"><strong>{{money(price(p))}}</strong><del v-if="price(p)<p.preco">{{money(p.preco)}}</del></div><RouterLink class="btn primary full" :to="`/checkout/${p.id}`"><ShoppingCart :size="17"/> Comprar agora</RouterLink></div></article></div></section>
<section class="banner"><div class="container"><div class="eyebrow">TUDO PARA MOMENTOS INESQUECÍVEIS</div><h2>O carinho mora nos <em>detalhes.</em></h2><a class="btn primary" :href="whatsapp(phone,'Olá! Gostaria de escolher um presente especial.')" target="_blank" rel="noopener">Conversar com a equipe ↗</a></div></section><footer class="footer"><div class="container"><strong>Shopping de Flores</strong><p>Tudo para momentos inesquecíveis.</p><small>© {{new Date().getFullYear()}} Shopping de Flores</small></div></footer>
</template>
