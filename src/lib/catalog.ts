import {db} from './supabase';
export type Product={id:string;nome:string;slug:string;descricao:string;categoria:string;categoria_id:string|null;preco:number;preco_promocional:number|null;imagem_url:string;imagem_2_url:string;imagem_3_url:string;ativo:boolean;destaque:boolean;instagram_destaque:boolean;ordem:number};
export type Category={id:string;nome:string;slug:string;imagem_url:string;ativo:boolean;ordem:number};
export type Settings={id:string;whatsapp_vendas:string;nome_empresa:string;nome_equipe:string;instagram:string;logo_url:string;texto_topo:string;texto_secundario:string;texto_whatsapp:string;entrega_expressa:boolean;ativo:boolean};
export type Frete={id:string;cidade:string;custo:number;custo_expresso:number;estrategia:string;status:string};
export type Banner={id:string;titulo:string;subtitulo:string;imagem_desktop:string;imagem_mobile:string;link:string;texto_botao:string;ativo:boolean;ordem:number};
export const tables=['digital_catalog_products','digital_catalog_categories','digital_catalog_banners','digital_catalog_settings','fretes_cidades','black_friday_promos','pedidos','pagamentos'] as const;
export const logoDefault='https://horizons-cdn.hostinger.com/01257f8f-d383-4d1c-8da8-99733736efa7/8dd01cdf4c4175e4fee7f7cbc2f00422.jpg';
export const heroDefault='https://images.hostinger.com/06430671-c889-4dbb-91ee-33d3de19b956.png';
export const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
export const price=(p:Product)=>p.preco_promocional!=null&&p.preco_promocional>0&&p.preco_promocional<p.preco?p.preco_promocional:p.preco;
export const slugify=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');
export function imageUrl(value:string|null|undefined){if(!value)return '';if(/^https?:\/\//.test(value))return value;const {data}=db().storage.from('catalogo').getPublicUrl(value);return data.publicUrl;}
export async function list<T>(table:string, publicOnly=true):Promise<T[]>{
 let q=db().from(table).select('*');
 if(publicOnly){if(['digital_catalog_products','digital_catalog_categories','digital_catalog_banners'].includes(table))q=q.eq('ativo',true);else if(table==='fretes_cidades')q=q.eq('status','ativo');}
 if(['digital_catalog_products','digital_catalog_categories','digital_catalog_banners'].includes(table))q=q.order('ordem',{ascending:true});
 const {data,error}=await q.limit(1000); if(error)throw error;return (data??[]) as T[];
}
export async function settings():Promise<Settings|null>{const {data,error}=await db().from('digital_catalog_settings').select('*').eq('ativo',true).limit(1).maybeSingle();if(error)throw error;return data as Settings|null;}
export function whatsapp(phone:string,message:string){return `https://wa.me/${(phone||'5519993614366').replace(/\D/g,'')}?text=${encodeURIComponent(message)}`;}
export async function uploadImage(file:File){const ext=file.name.split('.').pop()?.toLowerCase()||'jpg';if(!['jpg','jpeg','png','webp'].includes(ext))throw Error('Use JPG, PNG ou WebP');if(file.size>8*1024*1024)throw Error('Imagem acima de 8 MB');const path=`produtos/${crypto.randomUUID()}.${ext}`;const {error}=await db().storage.from('catalogo').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return path;}


// Produtos do e-commerce 2.0: somente leitura. Não grava nem replica produtos.
export type EcommerceProductRow = {
  id: string; slug?: string|null; nome: string; descricao?: string|null;
  preco: number|string; promo_preco?: number|string|null; imagem?: string|null;
  imagens_adicionais?: unknown; categorias?: unknown; ativo?: boolean|null;
  destaque_loja?: boolean|null; created_at?: string|null;
};
export function normalizeEcommerceProduct(row: EcommerceProductRow): Product {
  const cats = Array.isArray(row.categorias) ? row.categorias.filter((v):v is string=>typeof v==='string') : [];
  const extra = Array.isArray(row.imagens_adicionais) ? row.imagens_adicionais.filter((v):v is string=>typeof v==='string') : [];
  return {
    id: String(row.id), nome: row.nome, slug: row.slug || String(row.id),
    descricao: row.descricao||'', categoria:cats[0]||'', categoria_id:null,
    preco:Number(row.preco)||0,
    preco_promocional: row.promo_preco==null?null:Number(row.promo_preco),
    imagem_url: row.imagem||'', imagem_2_url:extra[0]||'', imagem_3_url:extra[1]||'',
    ativo:row.ativo!==false, destaque:!!row.destaque_loja, instagram_destaque:false,ordem:0
  };
}
export async function listEcommerceProducts():Promise<Product[]> {
  const PAGE=500, output:Product[]=[];
  for(let offset=0;offset<10000;offset+=PAGE){
    const {data,error}=await db().from('produtos_novo').select('id,slug,nome,descricao,preco,promo_preco,imagem,imagens_adicionais,categorias,ativo,destaque_loja,created_at')
      .eq('ativo',true).order('created_at',{ascending:false}).range(offset,offset+PAGE-1);
    if(error)throw new Error(`Não foi possível consultar produtos_novo: ${error.message}`);
    const batch=(data||[]) as EcommerceProductRow[];
    output.push(...batch.map(normalizeEcommerceProduct));
    if(batch.length<PAGE)break;
  }
  return output;
}
export function ecommerceCategories(products:Product[]):Category[]{
  const names=[...new Set(products.map(p=>p.categoria.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  return names.map((name,index)=>({id:name,nome:name,slug:slugify(name),imagem_url:'',ativo:true,ordem:index}));
}
export async function getEcommerceProduct(slugOrId:string):Promise<Product|null>{
  // Consulta por ID; se não houver, tenta slug. Sem interpolação em filtros SQL.
  const client=db();
  const {data:byId,error:idError}=await client.from('produtos_novo').select('*').eq('id',slugOrId).eq('ativo',true).maybeSingle();
  if(byId)return normalizeEcommerceProduct(byId as EcommerceProductRow);
  // Para UUID inválido o PostgREST pode retornar 22P02; tentamos slug normalmente.
  if(idError && idError.code!=='22P02')throw idError;
  const {data,error}=await client.from('produtos_novo').select('*').eq('slug',slugOrId).eq('ativo',true).maybeSingle();
  if(error)throw error;
  return data?normalizeEcommerceProduct(data as EcommerceProductRow):null;
}

// Link legado opcional. Fluxo principal utiliza checkout interno Vue.
// Nunca calcule valores definitivos ou confirme pagamentos somente no frontend.
export function purchaseUrl(product: Pick<Product, 'id'|'slug'>): string {
  const identifier = product.slug?.trim() || product.id;
  const url = new URL(`/produto/${encodeURIComponent(identifier)}`, 'https://shoppingdeflores.com');
  // Mantém UTMs do catálogo para atribuição no e-commerce, sem transportar dados sensíveis.
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid']) {
      const value = params.get(key);
      if (value && value.length < 300) url.searchParams.set(key, value);
    }
  }
  if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source','catalogo_digital');
  if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium','referral');
  return url.toString();
}
