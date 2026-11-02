import {createClient} from '@supabase/supabase-js';
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent=text; };
let busy=false, client, csrf;
function showConsent(session) {
  $('details').textContent=`Cuenta de Evoll: ${session.user.email || 'cuenta autenticada'}.`;
  $('login').hidden=true;$('social').hidden=true;$('consent').hidden=false;
  status('Sesión iniciada. Revisa y autoriza la conexión.');
}
async function submit(path,data={}) {
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data),redirect:'error'});
  const result=await res.json();
  if (!res.ok || !result.redirect) throw new Error('No se pudo completar la vinculación. Reiníciala desde la app Alexa.');
  // Only the server constructs this URL from an exact registered callback.
  location.replace(result.redirect);
}
$('login').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !client)return;busy=true;
  try {
    status('Iniciando sesión…');
    const {data,error}=await client.auth.signInWithPassword({email:$('email').value,password:$('password').value});
    $('password').value='';
    if(error || !data.session)throw new Error('No se pudo iniciar sesión. Comprueba tus credenciales de Evoll.');
    showConsent(data.session);
  }catch(e){status(e.message);}finally{busy=false;}
});
for (const provider of ['google','apple']) $(''+provider).addEventListener('click',async()=>{
  if(busy||!client)return;busy=true;
  try {
    status(`Abriendo ${provider==='google'?'Google':'Apple'}…`);
    const {data,error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:`${location.origin}/login.html`,skipBrowserRedirect:true}});
    if(error||!data.url)throw new Error('No se pudo abrir el proveedor. Usa correo y contraseña.');
    location.assign(data.url);
  } catch(e) {status(e.message);busy=false;}
});
$('approve').addEventListener('click',async()=>{
  if(busy || !client)return;busy=true;
  try {
    const {data}=await client.auth.getSession();
    if(!data.session)throw new Error('La sesión caducó. Reinicia la vinculación desde Alexa.');
    status('Vinculando…');await submit('/approve',{refresh_token:data.session.refresh_token});
  }catch(e){status(e.message);busy=false;}
});
$('deny').addEventListener('click',async()=>{
  if(busy)return;busy=true;
  try{await submit('/deny');}catch(e){status(e.message);busy=false;}
});
(async()=>{
  try {
    const res=await fetch('/session',{redirect:'error'}), config=await res.json();
    if(!res.ok)throw new Error('Abre esta página desde Vincular cuenta en la app Alexa.');
    csrf=config.csrf;
    client=createClient(config.supabaseUrl,config.publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const fragment=new URLSearchParams(location.hash.replace(/^#/,''));
    if(fragment.get('access_token')&&fragment.get('refresh_token')) {
      // Remove credentials from browser history before the first network await.
      history.replaceState(null,'',location.pathname+location.search);
      const {data,error}=await client.auth.setSession({access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token')});
      if(error||!data.session)throw new Error('No se pudo completar el acceso. Reinicia la vinculación desde Alexa.');
      showConsent(data.session);return;
    }
    $('login').hidden=false;$('social').hidden=false;status('Inicia sesión con Evoll. Tus credenciales se envían directamente a Supabase o a tu proveedor.');
  }catch{status('Solicitud inválida o caducada. Inicia la vinculación desde la app Alexa.');}
})();
