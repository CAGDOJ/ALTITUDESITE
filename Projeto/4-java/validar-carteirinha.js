(async () => {
  'use strict';
  const loading = document.getElementById('cardValidationLoading');
  const result = document.getElementById('cardValidationResult');
  const code = new URLSearchParams(location.search).get('codigo');
  const showInvalid = (message) => {
    loading.hidden = true; result.hidden = false;
    result.innerHTML = `<div class="validation-state bad">×</div><h1>Carteirinha não validada</h1><p class="validation-sub">${message}</p>`;
  };
  if (!code) return showInvalid('O QR Code não contém um código de validação.');
  try {
    const { data, error } = await sb.rpc('validar_carteirinha', { p_codigo: code });
    if (error) throw error;
    if (!Array.isArray(data) || !data.length) return showInvalid('Código inexistente, aluno inativo ou carteirinha cancelada.');
    const card = data[0];
    loading.hidden = true; result.hidden = false;
    result.innerHTML = `<div class="validation-state ok">✓</div><h1>Carteirinha válida</h1><p class="validation-sub">Vínculo confirmado na base oficial do Instituto Altitude.</p><dl><div><dt>Aluno</dt><dd>${escapeHtml(card.nome)}</dd></div><div><dt>Registro acadêmico</dt><dd>${escapeHtml(card.ra || '—')}</dd></div><div><dt>Status</dt><dd>${escapeHtml(card.status)}</dd></div><div><dt>Cursos vinculados</dt><dd>${Number(card.cursos_ativos || 0)}</dd></div></dl>`;
  } catch (error) { showInvalid(error.message || 'Não foi possível consultar a base oficial.'); }
  function escapeHtml(value=''){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
})();
