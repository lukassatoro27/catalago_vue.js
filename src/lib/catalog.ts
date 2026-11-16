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
