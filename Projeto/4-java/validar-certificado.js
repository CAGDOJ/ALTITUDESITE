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

function dataValidacaoBR(value, fallback = "—") {
  if (!value) return fallback;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00`)
    : new Date(value);
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

  const status = String(data.status || "—").toUpperCase();
  const title = valido ? "Certificado autêntico e válido"
    : status === "PENDENTE" ? "Certificado aguardando liberação"
    : status === "BLOQUEADO" ? "Certificado bloqueado"
    : status === "CANCELADO" ? "Certificado cancelado"
    : "Certificado sem validade atual";
  const emitido = status === "EMITIDO" && data.emitido_em;

  resultadoValidacao.innerHTML = `
    <div class="result-heading">
      <div class="result-icon">${valido ? "✓" : "!"}</div>
      <div><h2>${title}</h2><p>${validarEscape(data.mensagem || "Consulta concluída.")}</p></div>
    </div>
    <div class="result-grid">
      <div class="result-field wide"><span>Aluno</span><strong>${validarEscape(data.nome_aluno || "—")}</strong></div>
      <div class="result-field"><span>Status</span><strong>${validarEscape(status.replaceAll("_", " "))}</strong></div>
      <div class="result-field wide"><span>Curso</span><strong>${validarEscape(data.nome_curso || "—")}</strong></div>
      <div class="result-field"><span>Carga horária</span><strong>${Number(data.horas_emitidas || 0)} horas</strong></div>
      <div class="result-field"><span>Emissão</span><strong>${emitido ? dataValidacaoBR(data.emitido_em) : "Ainda não emitido"}</strong></div>
      <div class="result-field"><span>Período acadêmico</span><strong>${emitido && data.periodo_inicio ? `${dataValidacaoBR(data.periodo_inicio)} a ${dataValidacaoBR(data.periodo_fim)}` : "Definido na liberação"}</strong></div>
      <div class="result-field"><span>Validade</span><strong>${emitido ? (data.valido_ate ? dataValidacaoBR(data.valido_ate) : "Permanente") : "Não se aplica"}</strong></div>
      <div class="result-field"><span>Nota final</span><strong>${Number(data.nota_final || 0)}%</strong></div>
      <div class="result-field wide"><span>Número do certificado</span><strong>${validarEscape(data.numero_certificado || "Aguardando emissão")}</strong></div>
      <div class="result-field"><span>Código de autenticação</span><strong>${validarEscape(data.codigo_validacao || "Aguardando emissão")}</strong></div>
      ${data.observacao ? `<div class="result-field wide"><span>Observação da instituição</span><strong>${validarEscape(data.observacao)}</strong></div>` : ""}
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
