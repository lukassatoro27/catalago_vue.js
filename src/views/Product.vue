<script setup lang="ts">
import {ref,computed,watch} from 'vue';
import {useRoute,RouterLink} from 'vue-router';
import {type Product,price,money,imageUrl,getEcommerceProduct} from '../lib/catalog';
const route=useRoute(),item=ref<Product|null>(null),error=ref(''),selected=ref(0);
const images=computed(()=>item.value?[item.value.imagem_url,item.value.imagem_2_url,item.value.imagem_3_url].filter(Boolean):[]);
watch(()=>route.params.slug,async(slug,_,onCleanup)=>{let active=true;onCleanup(()=>{active=false});item.value=null;error.value='';selected.value=0;try{const result=await getEcommerceProduct(String(slug));if(!active)return;item.value=result;if(!result)error.value='Produto não encontrado ou indisponível.';}catch(e){if(active)error.value=e instanceof Error?e.message:'Não foi possível carregar o produto.';}},{immediate:true});
</script>
<template>
<div class="container detail upgraded-detail"><RouterLink to="/" class="back">← Voltar ao catálogo</RouterLink><p v-if="error" class="notice error" role="alert">{{error}}</p>
<div v-if="item" class="detail-grid"><div class="detail-gallery"><img v-if="images.length" :src="imageUrl(images[selected])" :alt="item.nome" class="gallery-main"/><div v-else class="gallery-main placeholder">✿</div><div v-if="images.length>1" class="gallery-thumbs"><button v-for="(img,i) in images" :key="i" :aria-label="`Ver foto ${i+1}`" :aria-pressed="selected===i" @click="selected=i"><img :src="imageUrl(img)" alt=""/></button></div></div>
<div class="detail-copy"><div class="eyebrow">{{item.categoria||'SHOPPING DE FLORES'}}</div><h1>{{item.nome}}</h1><div class="price detail-price"><del v-if="price(item)<item.preco">{{money(item.preco)}}</del><strong>{{money(price(item))}}</strong></div><p class="checkout-note">Entrega e descontos calculados no checkout.</p><div class="detail-purchase"><RouterLink class="btn primary full" :to="`/checkout/${item.id}`">Continuar para compra →</RouterLink></div><p class="checkout-note">Pix ou cartão • Cupom no checkout</p><h2>Sobre este presente</h2><p class="product-description">{{item.descricao||'Escolha este presente e personalize sua mensagem na próxima etapa.'}}</p></div></div><p v-else-if="!error" class="notice" role="status">Carregando produto...</p></div>
</template>
