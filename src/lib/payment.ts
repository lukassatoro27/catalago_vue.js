import {db} from './supabase';

// Os tokens privados e o acesso ao Mercado Pago ficam exclusivamente no backend existente.
export async function invokePayment<T=Record<string,unknown>>(name:string,body:Record<string,unknown>):Promise<T>{
  const {data,error}=await db().functions.invoke(name,{body});
  if(error)throw Error(error.message||`Falha na função ${name}`);
  if(data?.error)throw Error(String(data.message||data.error));
  return data as T;
}

let mpPromise:Promise<any>|null=null;
export async function mercadoPagoSdk():Promise<any>{
  if(mpPromise)return mpPromise;
  mpPromise=(async()=>{
    const key=await invokePayment<{publicKey:string}>('get-mp-public-key',{});
    if(!key.publicKey)throw Error('Chave pública Mercado Pago indisponível');
    const w=window as typeof window & {MercadoPago?:new (key:string,opts:object)=>any};
    if(!w.MercadoPago){
      await new Promise<void>((resolve,reject)=>{
        const script=document.createElement('script');script.src='https://sdk.mercadopago.com/js/v2';script.async=true;
        script.onload=()=>resolve();script.onerror=()=>reject(Error('SDK Mercado Pago indisponível'));document.head.appendChild(script);
      });
    }
    if(!w.MercadoPago)throw Error('SDK Mercado Pago não carregou');
    return new w.MercadoPago(key.publicKey,{locale:'pt-BR'});
  })().catch(e=>{mpPromise=null;throw e});
  return mpPromise;
}

export function paymentMethod(number:string){const n=number.replace(/\D/g,'');if(/^(4011|4389|4576|5041|5067|509|6277|6362|650|651|652|653)/.test(n))return 'elo';if(/^4/.test(n))return 'visa';if(/^(5[1-5]|2[2-7])/.test(n))return 'master';if(/^(34|37)/.test(n))return 'amex';if(/^(4011|4389|4576|5041|5067|509|6277|6362|650|651|652|653)/.test(n))return 'elo';return '';}
