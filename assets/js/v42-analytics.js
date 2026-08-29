(() => {
  'use strict';

  const VISITOR_KEY = 'altitude_visitor_v42';
  const SESSION_KEY = 'altitude_session_v42';
  const SESSION_START_KEY = 'altitude_session_start_v42';
  const sent = new Map();

  function uuid() {
    return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function persistent(key, storage) {
    let value = storage.getItem(key);
    if (!value) { value = uuid(); storage.setItem(key, value); }
    return value;
  }
  const visitorId = persistent(VISITOR_KEY, localStorage);
  const sessionId = persistent(SESSION_KEY, sessionStorage);
  if (!sessionStorage.getItem(SESSION_START_KEY)) sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
  const sessionStartedAt = Number(sessionStorage.getItem(SESSION_START_KEY) || Date.now());

  const clean = (value, max = 180) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const route = () => (location.pathname.replace(/\/+$/, '/') || '/');
  const device = () => window.innerWidth <= 700 ? 'mobile' : window.innerWidth <= 1120 ? 'tablet' : 'desktop';
  const browser = () => {
    const ua = navigator.userAgent;
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/OPR\//i.test(ua)) return 'Opera';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    if (/Chrome\//i.test(ua)) return 'Chrome';
    if (/Safari\//i.test(ua)) return 'Safari';
    return 'Outro';
  };
  const os = () => {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS/iPadOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Outro';
  };
  function sourceInfo() {
    const qs = new URLSearchParams(location.search);
    const utmSource = clean(qs.get('utm_source'), 80).toLowerCase();
    const utmMedium = clean(qs.get('utm_medium'), 80).toLowerCase();
    const utmCampaign = clean(qs.get('utm_campaign'), 120);
    let domain = '';
    try { domain = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch (_) {}
    let source = 'direct';
    if (utmSource) source = utmSource.includes('instagram') ? 'instagram' : utmSource.includes('google') ? 'google' : 'other';
    else if (/instagram|l\.instagram|ig\.me/.test(domain)) source = 'instagram';
    else if (/google\./.test(domain)) source = 'google';
    else if (domain && domain !== location.hostname.toLowerCase()) source = 'other';
    return { source, referrer: clean(document.referrer, 400) || null, referrer_domain: domain || null, utm_source: utmSource || null, utm_medium: utmMedium || null, utm_campaign: utmCampaign || null };
  }
  async function userId() {
    try {
      const { data } = await window.sb?.auth?.getUser?.();
      return data?.user?.id || null;
    } catch (_) { return null; }
  }
  function baseMeta(extra = {}) {
    return {
      visitor_id: visitorId,
      session_id: sessionId,
      title: document.title || '',
      href: location.href.slice(0, 500),
      browser: browser(),
      os: os(),
      language: navigator.language || null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      ...sourceInfo(),
      ...extra
    };
  }
  async function send(tipo, nome = '', metadata = {}, options = {}) {
    if (!window.sb?.from) return;
    const key = `${tipo}|${nome}|${route()}`;
    const now = Date.now();
    if (!options.force && now - (sent.get(key) || 0) < (options.dedupeMs || 900)) return;
    sent.set(key, now);
    try {
      const uid = await userId();
      await window.sb.from('analytics_eventos_v41').insert({
        user_id: uid,
        sessao_id: sessionId,
        tipo: clean(tipo, 50),
        nome: clean(nome, 120) || null,
        pagina: route(),
        dispositivo: device(),
        metadata: baseMeta(metadata)
      });
    } catch (error) {
      console.debug('Analytics V42 indisponível:', error?.message || error);
    }
  }
  function label(el) {
    return clean(el?.dataset?.analytics || el?.getAttribute?.('aria-label') || el?.textContent || el?.title || el?.id || el?.tagName, 100);
  }
  function courseMeta(el) {
    const card = el?.closest?.('[data-curso-id],[data-course-id],[data-curso]');
    const id = el?.dataset?.cursoId || el?.dataset?.courseId || card?.dataset?.cursoId || card?.dataset?.courseId || card?.dataset?.curso || null;
    const title = card?.querySelector?.('h2,h3,strong')?.textContent || null;
    return { course_id: id ? Number(id) || id : null, course_title: clean(title, 140) || null };
  }

  document.addEventListener('click', (event) => {
    const el = event.target.closest('button,a,[role="button"]');
    if (!el) return;
    const text = label(el);
    const meta = { id: el.id || null, tab: el.dataset?.aba || el.dataset?.tab || null, ...courseMeta(el) };
    send('traffic_click', text, meta);
    if (/curso|estudar|matricul/i.test(text) || meta.course_id) send('course_interest', text, meta);
    if (/cadastr|criar conta|inscrever/i.test(text)) send('funnel_registration_start', text, meta);
    if (/matricul/i.test(text)) send('funnel_enrollment_click', text, meta);
  }, { passive: true });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    const id = String(form?.id || 'form');
    if (/cadastro|aluno|register/i.test(id)) send('funnel_registration_submit', id, { form_id: id }, { force: true });
  }, true);

  function pageView() { send('traffic_page_view', document.title, { path: route() }, { force: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pageView, { once: true }); else pageView();

  let lastTouch = 0;
  function sessionTouch(reason) {
    const now = Date.now();
    if (now - lastTouch < 5000) return;
    lastTouch = now;
    const seconds = Math.max(0, Math.round((now - sessionStartedAt) / 1000));
    send('traffic_session', reason, { seconds }, { force: true, dedupeMs: 0 });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sessionTouch('hidden'); });
  window.addEventListener('pagehide', () => sessionTouch('pagehide'));

  window.altitudeAnalyticsV42 = { send, visitorId, sessionId, sessionStartedAt };
})();
