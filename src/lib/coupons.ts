import {db} from './supabase';

export type Coupon = {
  code:string;
  is_first_purchase:boolean;
  require_cpf_validation:boolean;
  max_discount:number|null;
  allow_promotional_products:boolean|null;
  start_date:string|null;
  discount_type:string;
  discount_value:number;
  active:boolean;
  expiry_date:string|null;
  min_value:number|null;
  copy_count:number|null;
  use_count:number|null;
  final_use_count:number|null;
};

export function normalizeCouponCode(value:string):string { return value.trim().toUpperCase(); }
export async function validateCoupon(code:string, cartTotal:number):Promise<Coupon> {
  const normalized=normalizeCouponCode(code);
  if(!normalized)throw Error('Informe um código de cupom.');
  const {data,error}=await db().from('coupons')
    .select('code,discount_type,discount_value,active,expiry_date,min_value,copy_count,use_count,final_use_count,is_first_purchase,require_cpf_validation,max_discount,allow_promotional_products,start_date')
    .eq('code',normalized).maybeSingle();
  if(error)throw Error('Não foi possível consultar o cupom. Verifique as permissões do catálogo.');
  if(!data)throw Error('Cupom não encontrado.');
  const coupon=data as Coupon;
  if(!coupon.active)throw Error('Este cupom está inativo.');
  if(coupon.expiry_date && new Date(coupon.expiry_date).getTime()<Date.now())throw Error('Este cupom expirou.');
  if(coupon.start_date && new Date(coupon.start_date).getTime()>Date.now())throw Error('Este cupom ainda não está disponível.');
  const minimum=Number(coupon.min_value)||0;
  if(cartTotal<minimum)throw Error(`Valor mínimo para este cupom: R$ ${minimum.toFixed(2).replace('.',',')}.`);
  if(Number(coupon.copy_count)>0 && Number(coupon.use_count)>=Number(coupon.copy_count))throw Error('Este cupom atingiu o limite de utilizações.');
  if(!Number.isFinite(Number(coupon.discount_value))||Number(coupon.discount_value)<0)throw Error('Valor de desconto inválido.');
  return coupon;
}
export function calculateCoupon(coupon:Coupon, amount:number):number {
  const base=Math.max(0,Number(amount)||0);
  const raw=coupon.discount_type==='percentage'?base*Number(coupon.discount_value)/100:Number(coupon.discount_value);
  return Number(Math.min(base,Math.max(0,raw)).toFixed(2));
}
