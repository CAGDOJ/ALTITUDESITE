(() => {
  'use strict';
  const OLD_NAMES = [
    'Instituto de Educação e Tecnologia Altitude',
    'INSTITUTO DE EDUCAÇÃO E TECNOLOGIA ALTITUDE',
    'Instituição Altitude',
    'INSTITUIÇÃO ALTITUDE',
    'ALTITUDE CENTRO UNIVERSITÁRIO'
  ];

  function normalizeInstitutionName(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      let text = node.nodeValue || '';
      OLD_NAMES.forEach((oldName) => { text = text.replaceAll(oldName, 'Altitude Centro Universitário'); });
      node.nodeValue = text;
    });
  }

  async function applyCourseTypeVisibility() {
    const technicalTabs = [...document.querySelectorAll('[data-tipo="TECNICO"]')];
    // Segurança: técnico fica oculto até o banco confirmar que está visível.
    technicalTabs.forEach((item) => { item.hidden = true; item.setAttribute('aria-hidden', 'true'); });
    if (!window.sb) return;
    try {
      const { data, error } = await sb.from('tipos_curso_catalogo_v34').select('*').order('ordem');
      if (error) throw error;
      const byCode = new Map((data || []).map((item) => [String(item.codigo).toUpperCase(), item]));
      window.ALTITUDE_COURSE_TYPES_V34 = Object.fromEntries(byCode);
      document.dispatchEvent(new CustomEvent('altitude:course-types-v34',{detail:window.ALTITUDE_COURSE_TYPES_V34}));
      document.querySelectorAll('[data-tipo]').forEach((item) => {
        const type = byCode.get(String(item.dataset.tipo || '').toUpperCase());
        const visible = type ? Boolean(type.visivel_site) : String(item.dataset.tipo).toUpperCase() !== 'TECNICO';
        item.hidden = !visible;
        item.setAttribute('aria-hidden', String(!visible));
        item.dataset.enrollmentAllowed = String(type ? Boolean(type.permitir_inscricao) : visible);
      });
      const technicalPage = /\/tecnico\/?$/i.test(location.pathname) || /3-(?:tecnico|t#u00e9cnico)\.html/i.test(location.pathname);
      const technical = byCode.get('TECNICO');
      if (technicalPage && technical && !technical.visivel_site) {
        location.replace('/cursos/');
      }
    } catch (error) {
      console.warn('Visibilidade dos tipos de curso:', error.message);
    }
  }

  function installEnrollmentGuard() {
    document.addEventListener('click', (event) => {
      const technical = event.target.closest('[data-tipo="TECNICO"]');
      if (technical && technical.dataset.enrollmentAllowed === 'false') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function cleanPublicExplanations() {
    const phrases = [
      'Imagem, avaliação, popularidade e acesso ao conteúdo ficam organizados em um único card.',
      'A carga horária do certificado será escolhida pelo aluno após concluir o curso e ser aprovado.',
      'Todos os cursos publicados pelo gestor aparecem automaticamente aqui.',
      'Depois da inscrição, o conteúdo fica disponível no Portal do Aluno.'
    ];
    document.querySelectorAll('p,span,small').forEach((element) => {
      if (phrases.some((phrase) => element.textContent.trim() === phrase)) element.remove();
    });
  }

  function naturalizeLabels() {
    document.querySelectorAll('.home-eyebrow,.catalog-kicker,.validation-eyebrow,.eyebrow,.section-kicker').forEach((el) => {
      const text=(el.textContent||'').trim().toLocaleLowerCase('pt-BR');
      if(text) el.textContent=text.charAt(0).toLocaleUpperCase('pt-BR')+text.slice(1);
    });
  }

  function pageTitle() {
    const path=(location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    const map={
      '/':'Início','/cursos':'Cursos','/tecnico':'Cursos técnicos',
      '/login':'Acessar','/cadastro':'Cadastrar','/sobrenos':'Sobre Nós','/ajuda':'Ajuda','/certificados':'Validar Certificado',
      '/contrato':'Termos de Contrato','/politicadeprivacidade':'Política de Privacidade','/validar-carteirinha':'Validar Carteirinha','/login-gestor':'Acesso da Gestão'
    };
    const current=map[path]||'Altitude';
    document.title=`${current} - Altitude`;
    document.querySelectorAll('.old-header .navbar a,.dropdown-menu a').forEach(a=>{
      const label=(a.textContent||'').trim();
      if(current && ((current==='Início'&&label==='Início')||(current.startsWith('Cursos')&&label==='Cursos')||(current==='Validar Certificado'&&label==='Certificados')||(current==='Sobre Nós'&&label==='Sobre Nós')||(current==='Ajuda'&&label==='Ajuda'))){a.setAttribute('aria-current','page');}
      else a.removeAttribute('aria-current');
    });
  }

  function normalizeCourseFinder(){
    const section=document.querySelector('.course-finder-section');
    if(!section)return;
    const update=()=>{
      const tabs=[...section.querySelectorAll('[data-tipo],.course-type-tab')].filter(x=>!x.hidden&&x.getAttribute('aria-hidden')!=='true');
      section.classList.toggle('single-visible-type',tabs.length===1);
      if(tabs.length===1&&!tabs[0].classList.contains('active')) tabs[0].click();
    };
    update();
    new MutationObserver(update).observe(section,{subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','class']});
  }

  function ensureCnpjLink(){
    document.querySelectorAll('footer a').forEach(a=>{
      if(/consultar cnpj/i.test(a.textContent||''))a.remove();
    });
    const groups=[...document.querySelectorAll('footer ul,footer .footer-links,footer .links-rapidos')];
    const group=groups.find(g=>/validar certificado|política de privacidade|registro mec/i.test(g.textContent||''));
    if(group&&!group.querySelector('a[href*="cnpjreva/comprovante"]')){
      const a=document.createElement('a');a.href='https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/comprovante';a.target='_blank';a.rel='noopener';a.textContent='Comprovante de Inscrição no CNPJ';
      if(group.tagName==='UL'){const li=document.createElement('li');li.appendChild(a);group.appendChild(li);}else group.appendChild(a);
    }
  }

  function start() {
    normalizeInstitutionName();
    cleanPublicExplanations();
    installEnrollmentGuard();
    applyCourseTypeVisibility();
    naturalizeLabels();
    pageTitle();
    normalizeCourseFinder();
    ensureCnpjLink();
  }

  document.addEventListener('DOMContentLoaded', start);
})();
