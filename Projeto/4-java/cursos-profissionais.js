(function () {
  "use strict";

  const sb = window.sb;
  const $ = (id) => document.getElementById(id);
  const state = {
    cursos: [],
    cursoAtual: null,
    horas: "TODAS",
    categoria: "",
    busca: "",
    ordem: "ALTA",
    tipo: "PROFISSIONAL"
  };

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function capa(url) {
    return url || "/Projeto/3-img/background portaldoaluno.jpg";
  }

  function nivel(value) {
    const map = { BASICO: "Básico", INTERMEDIARIO: "Intermediário", AVANCADO: "Avançado" };
    return map[String(value || "BASICO").toUpperCase()] || "Básico";
  }

  function score(curso) {
    return (curso.destaque ? 1000000 : 0)
      + Number(curso.matriculas_total || 0) * 30
      + Number(curso.cliques || 0) * 3
      + Number(curso.visualizacoes || 0)
      + Number(curso.avaliacao_media || 0) * 20;
  }

  function isHot(curso) {
    const tipo = String(curso.tipo_curso || "PROFISSIONAL").toUpperCase();
    const top = state.cursos
      .filter((item) => String(item.tipo_curso || "PROFISSIONAL").toUpperCase() === tipo)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3)
      .map((item) => Number(item.id));
    return Boolean(curso.destaque) || (score(curso) > 0 && top.includes(Number(curso.id)));
  }

  function estrelas(media, total) {
    const rating = Number(media || 0);
    if (!Number(total || 0)) {
      return `<span class="stars" aria-label="Curso novo">☆☆☆☆☆</span><span class="rating-copy">Novo</span>`;
    }
    const rounded = Math.round(rating);
    const icons = Array.from({ length: 5 }, (_, i) => i < rounded ? "★" : "☆").join("");
    return `<span class="stars" aria-label="Avaliação ${rating.toFixed(1)} de 5">${icons}</span><span class="rating-copy">${rating.toFixed(1)} (${Number(total)})</span>`;
  }

  function toast(message, type = "") {
    const el = $("catalogToast");
    if (!el) return;
    el.textContent = message;
    el.className = `catalog-toast show ${type}`.trim();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = "catalog-toast"; }, 3500);
  }

  async function carregarCursos() {
    if (!sb) throw new Error("Supabase não foi carregado.");
    const { data, error } = await sb.rpc("listar_cursos_publicos");
    if (!error) return data || [];

    console.warn("RPC do catálogo ainda não instalada; usando consulta básica.", error);
    const fallback = await sb.from("cursos").select("*").eq("publicado", true).order("criado_em", { ascending: false });
    if (fallback.error) throw fallback.error;
    return (fallback.data || []).map((curso) => ({
      ...curso,
      nivel: curso.nivel || "BASICO",
      nota_minima: curso.nota_minima || 70,
      destaque: curso.destaque || false,
      visualizacoes: curso.visualizacoes || 0,
      cliques: curso.cliques || 0,
      matriculas_total: curso.matriculas_total || 0,
      avaliacao_media: curso.avaliacao_media || 0,
      avaliacoes_total: curso.avaliacoes_total || 0,
      total_modulos: 0,
      total_materiais: 0,
      total_questoes: 0,
      tipo_curso: curso.tipo_curso || "PROFISSIONAL"
    }));
  }

  function renderCargas() {
    const wrap = $("filtrosCarga");
    if (!wrap) return;
    const counts = new Map();
    state.cursos.filter((curso) => String(curso.tipo_curso || "PROFISSIONAL").toUpperCase() === state.tipo).forEach((curso) => {
      const h = Number(curso.carga_horaria || 0);
      counts.set(h, (counts.get(h) || 0) + 1);
    });
    const cargas = [...counts.keys()].sort((a, b) => a - b);
    wrap.innerHTML = `
      <button class="workload-box ${state.horas === "TODAS" ? "active" : ""}" type="button" data-horas="TODAS">
        <strong>Todas</strong><span>${state.cursos.filter((curso) => String(curso.tipo_curso || "PROFISSIONAL").toUpperCase() === state.tipo).length} ${state.cursos.filter((curso) => String(curso.tipo_curso || "PROFISSIONAL").toUpperCase() === state.tipo).length === 1 ? "curso" : "cursos"}</span>
      </button>
      ${cargas.map((h) => `
        <button class="workload-box ${String(state.horas) === String(h) ? "active" : ""}" type="button" data-horas="${h}">
          <strong>${h}h</strong><span>${counts.get(h)} ${counts.get(h) === 1 ? "curso" : "cursos"}</span>
        </button>`).join("")}`;
  }

  function renderCategorias() {
    const select = $("filtroCategoriaPublica");
    if (!select) return;
    const atual = state.categoria;
    const categorias = [...new Set(state.cursos.filter((item) => String(item.tipo_curso || "PROFISSIONAL").toUpperCase() === state.tipo).map((item) => item.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    select.innerHTML = `<option value="">Todas as áreas</option>${categorias.map((cat) => `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`).join("")}`;
    select.value = atual;
  }

  function cursosFiltrados() {
    let lista = state.cursos.filter((curso) => {
      const search = `${curso.titulo || ""} ${curso.descricao || ""} ${curso.categoria || ""}`.toLowerCase();
      const tipoOk = String(curso.tipo_curso || "PROFISSIONAL").toUpperCase() === state.tipo;
      const buscaOk = !state.busca || search.includes(state.busca);
      const categoriaOk = !state.categoria || curso.categoria === state.categoria;
      const horasOk = state.horas === "TODAS" || Number(curso.carga_horaria) === Number(state.horas);
      return buscaOk && categoriaOk && horasOk && tipoOk;
    });

    const sorters = {
      ALTA: (a, b) => score(b) - score(a),
      AVALIACAO: (a, b) => Number(b.avaliacao_media || 0) - Number(a.avaliacao_media || 0),
      MATRICULAS: (a, b) => Number(b.matriculas_total || 0) - Number(a.matriculas_total || 0),
      RECENTES: (a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0),
      CARGA_ASC: (a, b) => Number(a.carga_horaria || 0) - Number(b.carga_horaria || 0),
      CARGA_DESC: (a, b) => Number(b.carga_horaria || 0) - Number(a.carga_horaria || 0)
    };
    return lista.sort(sorters[state.ordem] || sorters.ALTA);
  }

  function card(curso) {
    const hot = isHot(curso);
    return `
      <article class="public-course-card" data-id="${Number(curso.id)}">
        <div class="public-course-cover">
          <img src="${escapeHTML(capa(curso.capa_url))}" alt="Capa do curso ${escapeHTML(curso.titulo)}" loading="lazy" onerror="this.src='/Projeto/3-img/LOGO.png'">
          <img class="course-brand-mark" src="/Projeto/3-img/LOGO.png" alt="" aria-hidden="true">
          ${hot ? `<span class="hot-badge">Em alta</span>` : ""}
          <span class="workload-chip">${Number(curso.carga_horaria || 0)}h</span>
        </div>
        <div class="public-course-body">
          <div class="course-category-row"><span class="course-category">${escapeHTML(curso.categoria || "Formação")}</span><span>${escapeHTML(nivel(curso.nivel))}</span></div>
          <h3 title="${escapeHTML(curso.titulo)}">${escapeHTML(curso.titulo || "Curso profissional")}</h3>
          <div class="course-rating">${estrelas(curso.avaliacao_media, curso.avaliacoes_total)}</div>
          <p>${escapeHTML(curso.descricao || "Curso profissional com conteúdo organizado por módulos e avaliação final.")}</p>
          <div class="course-stat-grid">
            <span><b>${Number(curso.total_modulos || 0)}</b><small>Módulos</small></span>
            <span><b>${Number(curso.matriculas_total || 0)}</b><small>Inscritos</small></span>
            <span><b>${Number(curso.cliques || 0)}</b><small>Acessos</small></span>
          </div>
          <div class="public-course-actions">
            <button class="catalog-secondary-button" type="button" data-action="detalhes" data-id="${Number(curso.id)}">Ver detalhes</button>
            <button class="catalog-primary-button" type="button" data-action="inscrever" data-id="${Number(curso.id)}">Inscrever-se</button>
          </div>
        </div>
      </article>`;
  }

  function renderCursos() {
    const lista = cursosFiltrados();
    const status = $("catalogStatus");
    const grid = $("catalogoCursos");
    if (!grid || !status) return;

    if (!state.cursos.length) {
      status.hidden = false;
      status.textContent = "Ainda não há cursos publicados. Assim que o gestor publicar, eles aparecerão aqui.";
      grid.innerHTML = "";
      return;
    }

    if (!lista.length) {
      status.hidden = false;
      const possuiTipo = state.cursos.some((curso) => String(curso.tipo_curso || "PROFISSIONAL").toUpperCase() === state.tipo);
      status.textContent = possuiTipo
        ? "Nenhum curso corresponde aos filtros escolhidos."
        : (state.tipo === "TECNICO" ? "Ainda não há cursos técnicos publicados." : "Ainda não há cursos profissionais publicados.");
      grid.innerHTML = "";
      return;
    }

    status.hidden = true;
    grid.innerHTML = lista.map(card).join("");
  }

  async function registrar(cursoId, tipo) {
    try { await sb.rpc("registrar_interacao_curso", { p_curso_id: Number(cursoId), p_tipo: tipo }); }
    catch (error) { console.debug("Métrica não registrada:", error); }
  }

  async function abrirDetalhes(cursoId) {
    const curso = state.cursos.find((item) => Number(item.id) === Number(cursoId));
    if (!curso) return;
    state.cursoAtual = curso;
    $("modalCursoCapa").src = capa(curso.capa_url);
    $("modalCursoCapa").alt = `Capa do curso ${curso.titulo || ""}`;
    $("modalCursoCategoria").textContent = curso.categoria || "Curso";
    $("modalCursoTitulo").textContent = curso.titulo || (state.tipo === "TECNICO" ? "Curso técnico" : "Curso profissional");
    $("modalCursoDescricao").textContent = curso.descricao || "Conteúdo profissional organizado por módulos.";
    $("modalCursoHoras").textContent = `${Number(curso.carga_horaria || 0)} horas`;
    $("modalCursoNivel").textContent = nivel(curso.nivel);
    $("modalCursoModulos").textContent = `${Number(curso.total_modulos || 0)} módulos`;
    $("modalCursoMateriais").textContent = `${Number(curso.total_materiais || 0)} materiais`;
    $("modalCursoQuestoes").textContent = `${Number(curso.total_questoes || 0)} questões`;
    $("modalCursoRating").innerHTML = estrelas(curso.avaliacao_media, curso.avaliacoes_total);
    $("modalCursoEmAlta").hidden = !isHot(curso);
    $("btnInscreverCurso").dataset.id = String(curso.id);
    $("modalCursoPublico").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    registrar(curso.id, "VISUALIZACAO");
  }

  function fecharModal() {
    $("modalCursoPublico")?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function inscrever(cursoId) {
    const id = Number(cursoId);
    if (!id) return;
    await registrar(id, "CLIQUE");

    const { data } = await sb.auth.getSession();
    if (!data?.session) {
      localStorage.setItem("altitude_curso_pendente", String(id));
      window.location.href = `/Projeto/1-html/4-login.html?curso=${id}`;
      return;
    }

    const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    if (button) { button.disabled = true; button.textContent = "Inscrevendo..."; }
    try {
      const { error } = await sb.rpc("matricular_em_curso", { p_curso_id: id });
      if (error) throw error;
      toast("Matrícula realizada. Abrindo seu curso...", "success");
      setTimeout(() => { window.location.href = `/Projeto/1-html/11-portaldoaluno.html?curso=${id}`; }, 700);
    } catch (error) {
      console.error(error);
      toast(error.message || "Não foi possível realizar a matrícula.", "error");
      if (button) { button.disabled = false; button.textContent = "Inscrever-se"; }
    }
  }

  function wire() {
    $("filtrosTipoCurso")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tipo]");
      if (!button) return;
      state.tipo = button.dataset.tipo;
      state.horas = "TODAS";
      document.querySelectorAll(".course-type-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      const title = $("tituloCursos");
      if (title) title.textContent = state.tipo === "TECNICO" ? "Cursos Técnicos" : "Cursos Profissionais";
      renderCategorias();
      renderCargas();
      renderCursos();
    });
    $("buscaCursosPublicos")?.addEventListener("input", (event) => { state.busca = event.target.value.trim().toLowerCase(); renderCursos(); });
    $("filtroCategoriaPublica")?.addEventListener("change", (event) => { state.categoria = event.target.value; renderCursos(); });
    $("ordenarCursosPublicos")?.addEventListener("change", (event) => { state.ordem = event.target.value; renderCursos(); });
    $("filtrosCarga")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-horas]");
      if (!button) return;
      state.horas = button.dataset.horas;
      renderCargas();
      renderCursos();
    });
    $("catalogoCursos")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = Number(button.dataset.id);
      if (button.dataset.action === "detalhes") abrirDetalhes(id);
      if (button.dataset.action === "inscrever") inscrever(id);
    });
    $("fecharModalCursoPublico")?.addEventListener("click", fecharModal);
    $("modalCursoPublico")?.addEventListener("click", (event) => { if (event.target.id === "modalCursoPublico") fecharModal(); });
    $("btnInscreverCurso")?.addEventListener("click", (event) => inscrever(event.currentTarget.dataset.id));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") fecharModal(); });
  }

  function configurarTempoRealCatalogo() {
    if (!sb || window.__altitudeRealtimeCatalogo) return;
    window.__altitudeRealtimeCatalogo = true;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          state.cursos = await carregarCursos();
          renderCategorias();
          renderCargas();
          renderCursos();
        } catch (error) {
          console.warn("Catálogo em tempo real:", error.message);
        }
      }, 450);
    };
    const channel = sb.channel('altitude-catalogo-tempo-real');
    ['cursos','modulos','materiais','matriculas','avaliacoes_cursos'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    });
    channel.subscribe();
  }

  async function start() {
    const queryType = String(new URLSearchParams(location.search).get("tipo") || "").toUpperCase();
    if (["PROFISSIONAL", "TECNICO"].includes(queryType)) {
      state.tipo = queryType;
      document.querySelectorAll(".course-type-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tipo === state.tipo));
      const title = $("tituloCursos");
      if (title) title.textContent = state.tipo === "TECNICO" ? "Cursos Técnicos" : "Cursos Profissionais";
    }
    wire();
    try {
      state.cursos = await carregarCursos();
      configurarTempoRealCatalogo();
      if (!window.__altitudeCatalogPolling) {
        window.__altitudeCatalogPolling = true;
        window.setInterval(async () => {
          if (document.hidden) return;
          try { state.cursos = await carregarCursos(); renderCategorias(); renderCargas(); renderCursos(); }
          catch (error) { console.warn("Atualização periódica do catálogo:", error.message); }
        }, 15000);
      }
      renderCategorias();
      renderCargas();
      renderCursos();
      const id = Number(new URLSearchParams(location.search).get("curso"));
      if (id) abrirDetalhes(id);
    } catch (error) {
      console.error(error);
      $("catalogStatus").hidden = false;
      $("catalogStatus").innerHTML = `Não foi possível carregar os cursos.<br><small>${escapeHTML(error.message)}</small>`;
      toast("Erro ao carregar o catálogo.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
