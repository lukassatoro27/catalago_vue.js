import {createApp} from 'vue';import {createRouter,createWebHistory} from 'vue-router';import App from './App.vue';import Store from './views/Store.vue';import Product from './views/Product.vue';import Login from './views/Login.vue';import Admin from './views/Admin.vue';import Checkout from './views/Checkout.vue';import {configured,isAdmin} from './lib/supabase';import './style.css';
const router=createRouter({history:createWebHistory(),routes:[
{path:'/',component:Store},{path:'/catalogo',component:Store},{path:'/catalogo/produto/:slug',component:Product},
{path:'/checkout/:id',component:Checkout},{path:'/admin/catalogo/login',component:Login},{path:'/admin/catalogo/:section?',component:Admin,meta:{admin:true}},
{path:'/admin',redirect:'/admin/catalogo'},{path:'/admin/dashboard',redirect:'/admin/catalogo'},
{path:'/:pathMatch(.*)*',redirect:'/'}]});
router.beforeEach(async(to)=>{if(to.meta.admin){if(!configured)return '/admin/catalogo/login';try{if(!(await isAdmin()))return {path:'/admin/catalogo/login',query:{returnTo:to.fullPath}};}catch{return '/admin/catalogo/login';}}});
createApp(App).use(router).mount('#app');
