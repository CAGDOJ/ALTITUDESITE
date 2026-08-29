(() => {
  'use strict';
  const SESSION_KEY = 'altitude_analytics_session_v42';
  const VISITOR_KEY = 'altitude_analytics_visitor_v42';
  const FIRST_SEEN_KEY = 'altitude_analytics_first_seen_v42';
  const lastSent = new Map();
  const uuid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const getStorage = (storage, key, create = true) => {
    try {
      let value = storage.getItem(key);
      if (!value && create) { value = uuid(); storage.setItem(key, value); }
      return value || '';
    } catch (_) { return create ? uuid() : ''; }
  };
  const sessionId = getStorage(sessionStorage, SESSION_KEY);
  const visitorId = getStorage(localStorage, VISITOR_KEY);
  let firstSeen = '';
  try {
    firstSeen = localStorage.getItem(FIRST_SEEN_KEY) || '';
    if (!firstSeen) { firstSeen = new Date().toISOString(); localStorage.setItem(FIRST_SEEN_KEY, firstSeen); }
  } catch (_) { firstSeen = new Date().toISOString(); }
  const returning = Date.now() - new Date(firstSeen).getTime() > 30 * 60 * 1000;
  const clean = (v, max = 180) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const route = () => location.pathname.replace(/\/+$/, '/') || '/';
  const device = () => innerWidth <= 700 ? 'mobile' : innerWidth <= 1120 ? 'tablet' : 'desktop';
  const browser = () => {
    const ua = navigator.userAgent;
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/CriOS|Chrome/i.test(ua)) return 'Chrome';
    if (/FxiOS|Firefox/i.test(ua)) return 'Firefox';
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
    return 'Outro';
  };
  const os = () => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS/iPadOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS X/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Outro';
  };
  const query = new URLSearchParams(location.search);
  const campaign = clean(query.get('utm_campaign') || '', 120);
  const medium = clean(query.get('utm_medium') || '', 80);
  const utmSource = clean(query.get('utm_source') || '', 80);
  const referrerHost = (() => { try { return document.referrer ? new URL(document.referrer).hostname : ''; } catch (_) { return ''; } })();
  const origin = (() => {
    if (utmSource) return utmSource;
    const host = referrerHost.toLowerCase();
    if (!host) return 'Direto';
    if (host.includes('google.')) return 'Google';
    if (host.includes('instagram.') || host.includes('l.instagram.')) return 'Instagram';
    if (host.includes('facebook.')) return 'Facebook';
    if (host.includes('t.co') || host.includes('twitter.') || host.includes('x.com')) return 'X/Twitter';
    try { if (host === location.hostname.toLowerCase()) return 'Interno'; } catch (_) {}
    return host;
  })();
  async function userId() {
    try { const { data } = await window.sb?.auth?.getUser?.(); return data?.user?.id || null; } catch (_) { return null; }
  }
  async function insertRow(row) {
    if (!window.sb?.from) return;
    const { error } = await window.sb.from('analytics_eventos_v41').insert(row);
    if (!error) return;
    // Compatibilidade enquanto o SQL V42 ainda não foi executado.
    const legacy = { user_id:row.user_id, sessao_id:row.sessao_id, tipo:row.tipo, nome:row.nome, pagina:row.pagina, dispositivo:row.dispositivo, metadata:row.metadata };
    const { error: legacyError } = await window.sb.from('analytics_eventos_v41').insert(legacy);
    if (legacyError) throw legacyError;
  }
  async function send(tipo, nome = '', metadata = {}) {
    const page = route();
    const key = `${tipo}|${nome}|${page}`;
    const now = Date.now();
    if (now - (lastSent.get(key) || 0) < 700) return;
    lastSent.set(key, now);
    try {
      const uid = await userId();
      const meta = {
        ...metadata,
        title: document.title || '',
        href: location.href.slice(0, 500),
        referrer: document.referrer?.slice(0, 500) || '',
        utm_source: utmSource || null,
        utm_medium: medium || null,
        utm_campaign: campaign || null,
        returning,
        first_seen: firstSeen
      };
      await insertRow({
        user_id: uid, sessao_id: sessionId, visitante_id: visitorId,
        tipo: clean(tipo, 50), nome: clean(nome, 120) || null,
        pagina: page, dispositivo: device(), origem: origin,
        campanha: campaign || null, navegador: browser(), sistema: os(), metadata: meta
      });
    } catch (error) { console.debug('Analytics V42 indisponível:', error?.message || error); }
  }
  const label = (el) => clean(el?.getAttribute?.('aria-label') || el?.dataset?.analytics || el?.textContent || el?.title || el?.id || el?.tagName, 100);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button,a,[role="button"]');
    if (!el) return;
    send('click', label(el), { id:el.id || null, tab:el.dataset?.aba || el.dataset?.tab || null });
  }, { passive:true });
  document.addEventListener('DOMContentLoaded', () => send('page_view', document.title, { returning }));
  let lastTouch = performance.now();
  const touch = () => {
    const now = performance.now();
    const seconds = Math.max(0, Math.round((now - lastTouch) / 1000));
    lastTouch = now;
    if (seconds >= 2) send('session_touch', 'tempo', { seconds });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') touch(); });
  window.addEventListener('pagehide', touch, { passive:true });
  const api = Object.freeze({ send, sessionId, visitorId });
  window.altitudeAnalyticsV42 = api;
  window.altitudeAnalyticsV41 = api; // compatibilidade com integrações já existentes.
})();
