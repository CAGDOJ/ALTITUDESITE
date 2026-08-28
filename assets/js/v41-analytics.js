(() => {
  'use strict';
  const STORAGE='altitude_analytics_session_v41';
  const lastSent=new Map();
  const sid=(()=>{let x=sessionStorage.getItem(STORAGE);if(!x){x=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);sessionStorage.setItem(STORAGE,x)}return x})();
  const device=()=>{const w=window.innerWidth;return w<=700?'mobile':w<=1120?'tablet':'desktop'};
  const clean=(v,max=180)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
  const route=()=>location.pathname.replace(/\/+$/,'/')||'/';
  async function getUser(){
    try{if(!window.sb?.auth)return null;const {data}=await window.sb.auth.getUser();return data?.user?.id||null}catch(_){return null}
  }
  async function send(tipo, nome='', meta={}){
    const key=`${tipo}|${nome}|${route()}`;const now=Date.now();if(now-(lastSent.get(key)||0)<900)return;lastSent.set(key,now);
    try{
      if(!window.sb?.from)return;
      const user_id=await getUser();
      await window.sb.from('analytics_eventos_v41').insert({
        user_id, sessao_id:sid, tipo:clean(tipo,50), nome:clean(nome,120)||null,
        pagina:route(), dispositivo:device(), metadata:{...meta,title:document.title||'',href:location.href.slice(0,500)}
      });
    }catch(error){console.debug('Analytics V41 indisponível:',error?.message||error)}
  }
  function label(el){return clean(el?.getAttribute?.('aria-label')||el?.dataset?.analytics||el?.textContent||el?.title||el?.id||el?.tagName,100)}
  document.addEventListener('click',(e)=>{const el=e.target.closest('button,a,[role="button"]');if(!el)return;send('click',label(el),{id:el.id||null,tab:el.dataset?.aba||el.dataset?.tab||null})},{passive:true});
  document.addEventListener('DOMContentLoaded',()=>send('page_view',document.title));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')send('session_touch','saida',{seconds:Math.round(performance.now()/1000)})});
  window.altitudeAnalyticsV41={send,sessionId:sid};
})();
