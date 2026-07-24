const formValidacao = document.getElementById("formValidarCertificado");
const inputCodigo = document.getElementById("codigoCertificado");
const resultadoValidacao = document.getElementById("resultadoValidacao");
const botaoValidar = document.getElementById("btnValidarCertificado");

function validarEscape(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dataValidacaoBR(value) {
  if (!value) return "Sem prazo de expiração";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function exibirResultado(data) {
  const valido = Boolean(data?.encontrado && data?.valido);
  resultadoValidacao.hidden = false;
  resultadoValidacao.className = `validation-result ${valido ? "valid" : "invalid"}`;

  if (!data?.encontrado) {
    resultadoValidacao.innerHTML = `
      <div class="result-heading">
        <div class="result-icon">×</div>
        <div><h2>Certificado não encontrado</h2><p>${validarEscape(data?.mensagem || "O código não consta na base oficial.")}</p></div>
      </div>`;
    return;
  }

  resultadoValidacao.innerHTML = `
    <div class="result-heading">
      <div class="result-icon">${valido ? "✓" : "!"}</div>
      <div><h2>${valido ? "Certificado autêntico e válido" : "Certificado sem validade atual"}</h2><p>${validarEscape(data.mensagem || "Consulta concluída.")}</p></div>
    </div>
    <div class="result-grid">
      <div class="result-field wide"><span>Aluno</span><strong>${validarEscape(data.nome_aluno || "—")}</strong></div>
      <div class="result-field"><span>Status</span><strong>${validarEscape(String(data.status || "—").replaceAll("_", " "))}</strong></div>
      <div class="result-field wide"><span>Curso</span><strong>${validarEscape(data.nome_curso || "—")}</strong></div>
      <div class="result-field"><span>Carga horária</span><strong>${Number(data.horas_emitidas || 0)} horas</strong></div>
      <div class="result-field"><span>Emissão</span><strong>${dataValidacaoBR(data.emitido_em)}</strong></div>
      <div class="result-field"><span>Validade</span><strong>${data.valido_ate ? dataValidacaoBR(data.valido_ate) : "Permanente"}</strong></div>
      <div class="result-field"><span>Nota final</span><strong>${Number(data.nota_final || 0)}%</strong></div>
      <div class="result-field wide"><span>Número do certificado</span><strong>${validarEscape(data.numero_certificado || "—")}</strong></div>
      <div class="result-field"><span>Código de autenticação</span><strong>${validarEscape(data.codigo_validacao || "—")}</strong></div>
    </div>`;
}

async function consultarCertificado(codigo) {
  const valor = String(codigo || "").trim();
  if (!valor) return;
  botaoValidar.disabled = true;
  botaoValidar.textContent = "Consultando...";
  resultadoValidacao.hidden = false;
  resultadoValidacao.className = "validation-result";
  resultadoValidacao.innerHTML = `<div class="result-heading"><div class="result-icon">…</div><div><h2>Consultando a base oficial</h2><p>Aguarde a resposta do Instituto Altitude.</p></div></div>`;

  try {
    const { data, error } = await window.sb.rpc("validar_certificado", { p_codigo: valor });
    if (error) throw error;
    exibirResultado(data);
  } catch (error) {
    exibirResultado({ encontrado: false, valido: false, mensagem: `Não foi possível consultar: ${error.message}. Verifique se a migração SQL foi aplicada.` });
  } finally {
    botaoValidar.disabled = false;
    botaoValidar.textContent = "Validar";
  }
}

formValidacao?.addEventListener("submit", (event) => {
  event.preventDefault();
  consultarCertificado(inputCodigo.value);
});

const codigoUrl = new URLSearchParams(window.location.search).get("codigo");
if (codigoUrl) {
  inputCodigo.value = codigoUrl;
  consultarCertificado(codigoUrl);
}
