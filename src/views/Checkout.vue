<script setup lang="ts">
import {ref,computed,onMounted,watch} from 'vue';
import {RouterLink,useRoute} from 'vue-router';
import {db} from '../lib/supabase';
import {getEcommerceProduct,money,price,imageUrl,type Product} from '../lib/catalog';
import {invokePayment,mercadoPagoSdk,paymentMethod} from '../lib/payment';
import {validateCoupon,calculateCoupon,normalizeCouponCode,type Coupon} from '../lib/coupons';

const route=useRoute();const product=ref<Product|null>(null);const loading=ref(true);const busy=ref(false);const error=ref('');const step=ref(1);
const qty=ref(1);const cepValidated=ref(false);const shipping=ref<number|null>(null);const periods=ref<any[]>([]);const periodId=ref('');
const orderId=ref('');const method=ref<'pix'|'card'>('pix');const pix=ref<{payment_id:string;qr_code:string;pix_code:string}|null>(null);const result=ref('');
const form=ref({cartinha:'',recipientName:'',recipientPhone:'',zipCode:'',street:'',number:'',complement:'',neighborhood:'',city:'',state:'',deliveryDate:'',buyerName:'',email:'',cpf:'',buyerPhone:''});
const card=ref({number:'',name:'',expiry:'',cvv:'',cpf:'',installments:1});
const subtotal=computed(()=>product.value?Number((price(product.value)*qty.value).toFixed(2)):0);
const grossTotal=computed(()=>Number((subtotal.value+(shipping.value??0)).toFixed(2)));
const couponInput=ref('');const coupon=ref<Coupon|null>(null);const couponBusy=ref(false);const couponMessage=ref('');
const previewDiscount=computed(()=>coupon.value?calculateCoupon(coupon.value,grossTotal.value):0);
const total=computed(()=>Number((grossTotal.value-previewDiscount.value).toFixed(2)));
// O total visual é uma prévia; create_order DEVE validar o cupom no banco.
// Conferimos o total persistido antes de oferecer qualquer forma de pagamento.
const confirmedTotal=ref<number|null>(null);
const paymentTotal=computed(()=>confirmedTotal.value??total.value);
async function applyCoupon(){
 couponMessage.value='';couponBusy.value=true;
 try{coupon.value=await validateCoupon(couponInput.value,grossTotal.value);couponInput.value=normalizeCouponCode(couponInput.value);couponMessage.value='Cupom aplicado! O desconto será conferido novamente ao confirmar o pedido.';}
 catch(e){coupon.value=null;couponMessage.value=e instanceof Error?e.message:String(e);}
 finally{couponBusy.value=false;}
}
function removeCoupon(){coupon.value=null;couponInput.value='';couponMessage.value='Cupom removido.';}
watch(grossTotal,async()=>{if(!coupon.value)return;try{coupon.value=await validateCoupon(coupon.value.code,grossTotal.value);couponMessage.value='Cupom revalidado após mudança no pedido.';}catch(e){coupon.value=null;couponMessage.value=e instanceof Error?e.message:String(e);}});

const selectedPeriod=computed(()=>periods.value.find(p=>String(p.id)===periodId.value));
const digits=(v:string)=>v.replace(/\D/g,'');
const todayBR=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=(key:string)=>parts.find(p=>p.type===key)?.value||'';return `${v('year')}-${v('month')}-${v('day')}`;};
const earliestDate=ref(todayBR());
const sundayBlocked=()=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(new Date())==='Sun';

onMounted(async()=>{try{
  product.value=await getEcommerceProduct(String(route.params.id));
  if(!product.value)throw Error('Produto não encontrado.');
  const {data,error:pe}=await db().from('delivery_periods').select('*').order('start_time',{ascending:true});
  if(pe)throw pe;periods.value=(data||[]).filter((p:any)=>p.is_active!==false&&p.ativo!==false);
  if(!periods.value.length)throw Error('Períodos de entrega indisponíveis.');
}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{loading.value=false;}});
watch(()=>form.value.zipCode,()=>{cepValidated.value=false;shipping.value=null;});
const validPeriod=()=>{
  const period=selectedPeriod.value;if(!period)return false;
  if(form.value.deliveryDate<todayBR())return false;
  if(form.value.deliveryDate!==todayBR())return true;
  const now=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(':','.'));
  const label=String(period.period_name||'').toLowerCase();
  if(label.includes('manh')&&now>=10)return false;
  if(label.includes('tarde')&&now>=16)return false;
  // Limites adicionais devem continuar sendo conferidos por create_order e funções Edge.
  return true;
};
async function checkCep(){if(digits(form.value.zipCode).length!==8){error.value='Informe um CEP com 8 dígitos.';return;}
 error.value='';busy.value=true;cepValidated.value=false;shipping.value=null;
 try{const r=await invokePayment<any>('validate-delivery-cep',{cep:digits(form.value.zipCode)});
  if(!r.valid||!r.served||r.shippingCost===null||r.shippingCost===undefined||!Number.isFinite(Number(r.shippingCost)))throw Error(r.message||'CEP não atendido ou frete indisponível.');
  form.value.city=r.city;form.value.state=r.state;form.value.street=r.street||form.value.street;form.value.neighborhood=r.neighborhood||form.value.neighborhood;
  shipping.value=Number(r.shippingCost);cepValidated.value=true;
 }catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false;}}
function next(){error.value='';if(step.value===1){if(!form.value.recipientName||digits(form.value.recipientPhone).length<10||!cepValidated.value||!form.value.street||!form.value.number||!form.value.neighborhood){error.value='Preencha os dados do destinatário e valide o CEP antes de continuar.';return;}}
 if(step.value===2){if(!form.value.deliveryDate||!validPeriod()){error.value='Selecione uma data e um período de entrega disponíveis.';return;}}
 if(step.value===3){if(!form.value.buyerName||!/^\S+@\S+\.\S+$/.test(form.value.email)||digits(form.value.cpf).length!==11||digits(form.value.buyerPhone).length<10){error.value='Confira nome, email, CPF e telefone do comprador.';return;}}
 step.value=Math.min(4,step.value+1);}

async function createOrder(){if(busy.value||orderId.value)return;
 error.value='';if(coupon.value && import.meta.env.VITE_CATALOG_COUPON_BACKEND_READY!=='true'){error.value='A aplicação de cupons está aguardando a ativação da validação segura no Supabase. O pedido sem cupom continua disponível.';return;}if(sundayBlocked()){error.value='Vendas pausadas aos domingos.';return;}
 if(!product.value||!cepValidated.value||shipping.value===null||!validPeriod()){error.value='Confira CEP, frete, data e período antes de prosseguir.';return;}
 busy.value=true;
 try{
  // Consulta preço novamente: o frontend nunca é fonte autorizada do valor.
  const fresh=await getEcommerceProduct(product.value.id);if(!fresh)throw Error('Produto indisponível.');
  if(Math.abs(price(fresh)-price(product.value))>0.001){product.value=fresh;throw Error('O preço foi atualizado. Confira o novo total e confirme novamente.');}
  // Revalida no momento da compra; o banco faz a validação final e autoritativa.
  if(coupon.value)coupon.value=await validateCoupon(coupon.value.code, grossTotal.value);
  const discount=coupon.value?calculateCoupon(coupon.value,grossTotal.value):0;
  const expectedTotal=Number((grossTotal.value-discount).toFixed(2));
  const p=selectedPeriod.value;
  const item={id:fresh.id,product_id:fresh.id,product_name:fresh.nome,name:fresh.nome,image_url:fresh.imagem_url,price:price(fresh),quantity:qty.value,size:null,addons:[],bouquet_composition:null,card:form.value.cartinha||null,shippingCost:shipping.value,deliveryType:'standard',expressPrice:0};
  const payload={p_user_id:null,p_total_amount:expectedTotal,p_items:[item],p_delivery_address:{name:form.value.recipientName,recipientName:form.value.recipientName,phone:form.value.recipientPhone,street:form.value.street,number:form.value.number,complement:form.value.complement,neighborhood:form.value.neighborhood,district:form.value.neighborhood,city:form.value.city,state:form.value.state,zipCode:digits(form.value.zipCode)},p_payment_method:'pending',p_delivery_type:'standard',p_delivery_period:p.period_name,p_delivery_date:form.value.deliveryDate,p_buyer_phone:form.value.buyerPhone,p_recipient_phone:form.value.recipientPhone,p_seller_id:null,p_metadata:{email:form.value.email,cpf:digits(form.value.cpf),buyer_name:form.value.buyerName,recipient_name:form.value.recipientName,delivery_date:form.value.deliveryDate,delivery_period:p.period_name,delivery_period_id:p.id,delivery_period_start:p.start_time,delivery_period_end:p.end_time,cartinha:form.value.cartinha||null,shipping_cost:shipping.value,express_shipping_cost:0,shipping_type:'business-days',delivery_type:'standard',subtotal:subtotal.value,coupon_code:coupon.value?.code||null,discount_amount:discount,tax:0,origin:'catalogo_vue'}};
  const {data,error:rpcError}=await db().rpc('create_order',payload);
  if(rpcError)throw rpcError;
  if(!data?.id)throw Error('Não foi possível criar o pedido.');
  const persisted=await db().from('orders').select('id,total_amount,metadata').eq('id',String(data.id)).maybeSingle();
  if((persisted.error || !persisted.data) && coupon.value)throw Error('Pedido criado, mas não foi possível conferir o valor autorizado. Não gere novo pedido; contate o atendimento com o ID '+String(data.id));
  const official=Number(persisted.data?.total_amount??data.total_amount);
  const serverCoupon=String(persisted.data?.metadata?.coupon_code||'').toUpperCase();
  const serverDiscount=Number(persisted.data?.metadata?.discount_amount||0);
  if(!Number.isFinite(official)||Math.abs(official-expectedTotal)>0.009 || (coupon.value&&(serverCoupon!==coupon.value.code||Math.abs(serverDiscount-discount)>0.009))){
    throw Error('Pedido '+String(data.id)+' registrado com divergência no desconto ou no total. Pagamento bloqueado; procure o atendimento antes de tentar novamente.');
  }
  confirmedTotal.value=official;
  orderId.value=String(data.id);step.value=5;
  if(form.value.cartinha){void db().functions.invoke('sync-ecommerce-cartinha',{body:{order_id:orderId.value}});}
 }catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false;}}
async function generatePix(){if(busy.value||!orderId.value||pix.value)return;busy.value=true;error.value='';try{
 const r=await invokePayment<any>('generate-pix',{orderId:orderId.value,amount:paymentTotal.value,description:`Pedido Catálogo #${orderId.value}`,userEmail:form.value.email,discount:0});const d=r.data||r;
 const qr=d.qr_code||d.qr_code_base64;const copy=d.pix_code||d.qr_code_text||d.copy_paste;
 if(!qr||!copy)throw Error('O servidor não retornou todos os dados do Pix.');
 pix.value={payment_id:String(d.payment_id||d.id||''),qr_code:String(qr).startsWith('data:')?qr:`data:image/jpeg;base64,${qr}`,pix_code:copy};
 }catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false;}}
async function payCard(){if(busy.value||!orderId.value)return;error.value='';result.value='';
 if(digits(card.value.number).length<13||!card.value.name.trim()||digits(card.value.cvv).length<3||digits(card.value.cpf).length!==11||!/^\d{2}\/\d{2,4}$/.test(card.value.expiry)){error.value='Confira os dados do cartão, validade, CVV e CPF.';return;}
 const brand=paymentMethod(card.value.number);if(!brand){error.value='Bandeira não identificada. Use um cartão compatível.';return;}
 busy.value=true;try{
  const mp=await mercadoPagoSdk();const [month,year]=card.value.expiry.split('/');
  const token=await mp.createCardToken({cardNumber:digits(card.value.number),cardholderName:card.value.name,cardExpirationMonth:month,cardExpirationYear:year.length===2?`20${year}`:year,securityCode:digits(card.value.cvv),identificationType:'CPF',identificationNumber:digits(card.value.cpf)});
  if(!token?.id)throw Error('Não foi possível validar os dados do cartão.');
  const parts=card.value.name.trim().split(/\s+/);
  const r=await invokePayment<any>('process-payment',{orderId:orderId.value,token:token.id,amount:paymentTotal.value,installments:Number(card.value.installments)||1,paymentMethodId:brand,payer:{email:form.value.email,first_name:parts[0],last_name:parts.slice(1).join(' ')||parts[0],identification:{type:'CPF',number:digits(card.value.cpf)}},idempotencyKey:crypto.randomUUID()});
  const status=String(r.status||r.mapped_status||'').toLowerCase();result.value=['approved','pago'].includes(status)?'Pagamento aprovado! Pedido confirmado.':(['pending','in_process','em_analise'].includes(status)?'Pagamento em análise. Aguarde a confirmação.':'Pagamento não aprovado. Confira o status antes de tentar novamente.');
 }catch(e){error.value=e instanceof Error?e.message:String(e)}finally{card.value.number='';card.value.cvv='';busy.value=false;}}
async function copyPix(){if(pix.value)await navigator.clipboard.writeText(pix.value.pix_code);}
async function checkStatus(){if(!orderId.value)return;busy.value=true;error.value='';try{const r=await invokePayment<any>('check-payment-status',{orderId:orderId.value});result.value=`Situação: ${String(r.payment_status||r.status||r.data?.status||'aguardando confirmação')}`;}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false;}}
</script>
<template>
<div class="container checkout-shell"><RouterLink to="/" class="back">← Voltar ao catálogo</RouterLink>
<div class="eyebrow">SHOPPING DE FLORES · PAGAMENTO SEGURO</div><h1>Finalizar <em>pedido.</em></h1>
<p v-if="loading" class="notice">Preparando checkout...</p><p v-if="error" class="notice error" role="alert">{{error}}</p>
<div v-if="product&&!loading" class="checkout-grid"><main class="checkout-main">
<div class="checkout-steps"><span v-for="(label,index) in ['Entrega','Data','Comprador','Revisão','Pagamento']" :key="label" :class="{current:step===index+1,done:step>index+1}">{{index+1}}. {{label}}</span></div>
<section v-if="step===1" class="checkout-panel"><h2>1. Entrega e cartinha</h2>
<label>Mensagem para acompanhar as flores<textarea v-model="form.cartinha" rows="3" placeholder="Sua mensagem especial (opcional)"></textarea></label>
<div class="checkout-two"><label>Nome de quem recebe *<input v-model="form.recipientName" autocomplete="name"/></label><label>Telefone de quem recebe *<input v-model="form.recipientPhone" inputmode="tel"/></label></div>
<div class="checkout-two"><label>CEP *<input v-model="form.zipCode" inputmode="numeric" maxlength="9" placeholder="00000-000"/></label><div class="checkout-cep"><button class="btn primary" type="button" :disabled="busy" @click="checkCep">Validar CEP</button><small v-if="cepValidated">✓ Entrega atendida: {{form.city}}/{{form.state}} · {{money(shipping??0)}}</small></div></div>
<div class="checkout-two"><label>Rua *<input v-model="form.street"/></label><label>Número *<input v-model="form.number"/></label></div><div class="checkout-two"><label>Bairro *<input v-model="form.neighborhood"/></label><label>Complemento<input v-model="form.complement"/></label></div>
<button class="btn primary full" @click="next">Continuar →</button></section>
<section v-if="step===2" class="checkout-panel"><h2>2. Data e período de entrega</h2><label>Data de entrega *<input v-model="form.deliveryDate" type="date" :min="earliestDate"/></label><label>Período disponível *<select v-model="periodId"><option value="">Selecione</option><option v-for="p in periods" :key="p.id" :value="String(p.id)">{{p.period_name}} ({{p.start_time}} – {{p.end_time}})</option></select></label><p>Os horários estão sujeitos às regras e limites de entrega do Shopping de Flores.</p><div class="checkout-actions"><button class="btn" @click="step=1">← Voltar</button><button class="btn primary" @click="next">Continuar →</button></div></section>
<section v-if="step===3" class="checkout-panel"><h2>3. Dados do comprador</h2><div class="checkout-two"><label>Nome completo *<input v-model="form.buyerName" autocomplete="name"/></label><label>Telefone *<input v-model="form.buyerPhone" inputmode="tel"/></label></div><div class="checkout-two"><label>Email *<input v-model="form.email" type="email" autocomplete="email"/></label><label>CPF *<input v-model="form.cpf" inputmode="numeric"/></label></div><div class="checkout-actions"><button class="btn" @click="step=2">← Voltar</button><button class="btn primary" @click="next">Continuar →</button></div></section>
<section v-if="step===4" class="checkout-panel"><h2>4. Revisão do pedido</h2><p><strong>Destinatário:</strong> {{form.recipientName}} · {{form.recipientPhone}}</p><p><strong>Entrega:</strong> {{form.street}}, {{form.number}} – {{form.neighborhood}}, {{form.city}}/{{form.state}} · CEP {{form.zipCode}}</p><p><strong>Data:</strong> {{form.deliveryDate}} · {{selectedPeriod?.period_name}}</p><p><strong>Comprador:</strong> {{form.buyerName}} · {{form.email}}</p><p><strong>Cartinha:</strong> {{form.cartinha||'Sem mensagem'}}</p><p class="checkout-warning">Ao confirmar, o pedido é registrado no Shopping de Flores. A cobrança só começa após selecionar uma forma de pagamento.</p><div class="checkout-actions"><button class="btn" @click="step=3">← Voltar</button><button class="btn primary" :disabled="busy" @click="createOrder">{{busy?'Criando pedido...':'Confirmar e ir para pagamento →'}}</button></div></section>
<section v-if="step===5" class="checkout-panel"><h2>5. Escolha como pagar</h2><p>Pedido <strong>#{{orderId.slice(0,8)}}</strong> · Total {{money(paymentTotal)}}</p><div class="checkout-methods"><button :class="{selected:method==='pix'}" @click="method='pix'" type="button">Pix · QR Code</button><button :class="{selected:method==='card'}" @click="method='card'" type="button">Cartão de crédito</button></div>
<div v-if="method==='pix'"><div v-if="!pix"><p>Gere um QR Code Pix para pagar sem sair do catálogo.</p><button :disabled="busy" class="btn primary full" @click="generatePix">{{busy?'Gerando...':'Gerar Pix'}}</button></div><div v-else class="pix-result"><img :src="pix.qr_code" alt="QR Code para pagamento Pix"/><label>Pix copia e cola<textarea :value="pix.pix_code" readonly rows="4"></textarea></label><button class="btn primary" @click="copyPix">Copiar código Pix</button></div></div>
<form v-else class="card-form" @submit.prevent="payCard" autocomplete="off"><label>Número do cartão *<input v-model="card.number" inputmode="numeric" autocomplete="cc-number" maxlength="23" required/></label><label>Nome impresso no cartão *<input v-model="card.name" autocomplete="cc-name" required/></label><div class="checkout-two"><label>Validade MM/AA *<input v-model="card.expiry" placeholder="MM/AA" autocomplete="cc-exp" required/></label><label>CVV *<input v-model="card.cvv" type="password" inputmode="numeric" maxlength="4" autocomplete="cc-csc" required/></label></div><div class="checkout-two"><label>CPF do titular *<input v-model="card.cpf" inputmode="numeric" required/></label><label>Parcelas<select v-model.number="card.installments"><option v-for="n in 6" :key="n" :value="n">{{n}}x (sujeito à confirmação do emissor)</option></select></label></div><button class="btn primary full" :disabled="busy" type="submit">{{busy?'Processando...':`Pagar ${money(paymentTotal)}`}}</button></form>
<p v-if="result" class="notice" role="status">{{result}}</p><button class="btn" type="button" :disabled="busy" @click="checkStatus">Consultar situação do pagamento</button><p class="checkout-warning">O pedido só é considerado pago após confirmação do Mercado Pago pelo sistema principal. Não efetue outra cobrança sem verificar o status.</p></section>
</main><aside class="checkout-panel checkout-summary"><h2>Resumo</h2><img v-if="product.imagem_url" :src="imageUrl(product.imagem_url)" :alt="product.nome"/><strong>{{product.nome}}</strong><label>Quantidade<select v-model.number="qty" :disabled="step>=4"><option v-for="n in 10" :key="n" :value="n">{{n}}</option></select></label><p>Produtos <strong>{{money(subtotal)}}</strong></p><p>Entrega <strong>{{shipping===null?'A calcular':money(shipping)}}</strong></p>
<div class="catalog-coupon"><label for="catalog-coupon-code">Tem um cupom de desconto?</label><div class="catalog-coupon-row"><input id="catalog-coupon-code" v-model="couponInput" :disabled="couponBusy||Boolean(orderId)" maxlength="80" placeholder="Código do cupom" autocomplete="off" @keyup.enter="applyCoupon"/><button type="button" class="btn primary" :disabled="couponBusy||Boolean(orderId)||!couponInput.trim()" @click="applyCoupon">{{couponBusy?'Verificando...':'Aplicar'}}</button></div>
<p v-if="couponMessage" class="catalog-coupon-note" role="status">{{couponMessage}}</p>
<div v-if="coupon" class="catalog-coupon-applied"><span>✓ {{coupon.code}}</span><button type="button" class="btn" :disabled="Boolean(orderId)" @click="removeCoupon">Remover</button></div></div>
<p v-if="coupon" class="catalog-coupon-discount">Desconto <strong>− {{money(previewDiscount)}}</strong></p>
<div class="checkout-total">Total <strong>{{money(total)}}</strong></div><small v-if="coupon && !orderId" class="catalog-coupon-note">O desconto é confirmado pelo servidor na criação do pedido.</small><small>Pagamento processado pelo Mercado Pago, usando as funções do e-commerce Shopping de Flores.</small></aside></div></div>
</template>
