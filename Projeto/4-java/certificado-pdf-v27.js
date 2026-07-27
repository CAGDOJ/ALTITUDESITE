(() => {
  'use strict';

  const escText = (value, fallback = '') => String(value ?? fallback);
  const dateBR = (value) => {
    if (!value) return '—';
    const text = String(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
  };
  const slug = (value) => String(value || 'certificado')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

  function formatCpf(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length !== 11) return String(value || '').trim() || '—';
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
  }

  function cleanTitle(value) {
    return String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\\(?:textbf|textit|emph)\{([^{}]*)\}/g, '$1')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripModulePrefix(value) {
    const cleaned = cleanTitle(value);
    return cleaned
      .replace(/^m[oó]dulo\s+\d+\s*(?:[-–—:|]\s*)?/i, '')
      .replace(/^unidade\s+\d+\s*(?:[-–—:|]\s*)?/i, '')
      .replace(/^\d+\s*(?:[-–—:.)]\s*)/, '')
      .trim();
  }

  function programTitle(module, index, course) {
    const direct = stripModulePrefix(module?.titulo);
    if (direct) return direct;
    const headings = extractHeadings(module);
    if (headings.length) return stripModulePrefix(headings[0]) || headings[0];
    const description = stripModulePrefix(module?.descricao);
    if (description) return description;
    const courseName = stripModulePrefix(course?.titulo) || 'Conteúdo do curso';
    return `${courseName} — parte ${index + 1}`;
  }

  function uniqueTitles(values) {
    const used = new Set();
    return values.map(cleanTitle).filter((value) => {
      if (!value || value.length < 3) return false;
      const key = value.toLocaleLowerCase('pt-BR');
      if (used.has(key)) return false;
      used.add(key);
      return true;
    });
  }

  function extractHeadings(module) {
    const source = [module?.conteudo_latex, module?.conteudo, module?.descricao].filter(Boolean).join('\n');
    const found = [];
    const latex = /\\(?:section|subsection)\*?\{([^{}]+)\}/g;
    const html = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
    const numbered = /(?:^|\n)\s*\d+(?:\.\d+)*[.)]?\s+([^\n]{5,100})/g;
    let match;
    while ((match = latex.exec(source))) found.push(match[1]);
    while ((match = html.exec(source))) found.push(match[1]);
    if (!found.length) while ((match = numbered.exec(source))) found.push(match[1]);
    return uniqueTitles(found).slice(0, 8);
  }

  function groupTitles(titles, targetCount) {
    const clean = uniqueTitles(titles);
    if (clean.length <= targetCount) return clean;
    const groups = [];
    for (let i = 0; i < targetCount; i += 1) {
      const start = Math.floor((i * clean.length) / targetCount);
      const end = Math.floor(((i + 1) * clean.length) / targetCount);
      const chunk = clean.slice(start, end);
      groups.push(chunk.length === 1 ? chunk[0] : chunk.join('; '));
    }
    return groups;
  }

  function distributeHours(items, totalHours) {
    const total = Math.max(0, Math.round(Number(totalHours || 0)));
    if (!items.length) return [];
    const base = Math.floor(total / items.length);
    const remainder = total % items.length;
    return items.map((item, index) => ({
      titulo: item.titulo,
      horas: base + (index < remainder ? 1 : 0)
    }));
  }

  async function imageToDataUrl(url) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Não foi possível carregar a logomarca.');
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function qrDataUrl(text) {
    if (!window.QRCode) throw new Error('Biblioteca de QR Code não carregada.');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:256px;height:256px;background:#fff';
    document.body.appendChild(host);
    try {
      new window.QRCode(host, {
        text,
        width: 256,
        height: 256,
        colorDark: '#07314f',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
      const canvas = host.querySelector('canvas');
      const image = host.querySelector('img');
      if (canvas) return canvas.toDataURL('image/png');
      if (image?.src) return image.src;
      throw new Error('Não foi possível gerar o QR Code.');
    } finally {
      host.remove();
    }
  }

  function frame(doc, width, height) {
    doc.setFillColor(248, 250, 253);
    doc.rect(0, 0, width, height, 'F');
    doc.setFillColor(55, 177, 203);
    doc.triangle(0, 0, 78, 0, 0, 66, 'F');
    doc.setFillColor(7, 49, 79);
    doc.triangle(0, 0, 56, 0, 0, 47, 'F');
    doc.setFillColor(7, 49, 79);
    doc.triangle(width, height, width - 78, height, width, height - 66, 'F');
    doc.setFillColor(55, 177, 203);
    doc.triangle(width, height, width - 55, height, width, height - 46, 'F');
    doc.setDrawColor(176, 143, 102);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, width - 20, height - 20);
    doc.setDrawColor(215, 224, 233);
    doc.setLineWidth(0.25);
    doc.rect(14, 14, width - 28, height - 28);
  }

  async function queryModules(sb, courseId) {
    if (!sb || !courseId) return [];
    const selections = [
      'id,titulo,descricao,conteudo,conteudo_latex,ordem,carga_horaria',
      'id,titulo,descricao,conteudo,conteudo_latex,ordem',
      'id,titulo,descricao,conteudo,ordem',
      'id,titulo,ordem'
    ];
    let lastError = null;
    for (const select of selections) {
      const result = await sb.from('modulos').select(select).eq('curso_id', Number(courseId)).order('ordem', { ascending: true });
      if (!result.error) return result.data || [];
      lastError = result.error;
    }
    throw lastError || new Error('Não foi possível carregar o conteúdo programático.');
  }

  async function loadProgram(sb, courseId, totalHours, course, certificateId = null) {
    let modules = [];
    if (sb && certificateId) {
      try {
        const rpc = await sb.rpc('obter_conteudo_programatico_certificado', { p_certificado_id: Number(certificateId) });
        if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length) modules = rpc.data;
      } catch (error) {
        console.warn('RPC do conteúdo programático indisponível:', error);
      }
    }
    const rpcLooksGeneric = modules.length === 1
      && /^(conte[uú]do program[aá]tico( do curso)?|material do curso)$/i.test(cleanTitle(modules[0]?.titulo))
      && !cleanTitle(modules[0]?.descricao)
      && !cleanTitle(modules[0]?.conteudo)
      && !cleanTitle(modules[0]?.conteudo_latex);
    if (!modules.length || rpcLooksGeneric) modules = await queryModules(sb, courseId);
    let items = modules.map((module, index) => ({
      titulo: programTitle(module, index, course)
    }));

    if (!items.length) {
      items = [{ titulo: stripModulePrefix(course?.titulo) || 'Conteúdo programático do curso' }];
    }
    if (items.length > 12) items = items.slice(0, 12);
    return distributeHours(items, totalHours);
  }

  function drawProgramItems(doc, items, width, height) {
    const left = 27;
    const rightPanelWidth = 82;
    const gap = 8;
    const availableWidth = width - left - rightPanelWidth - 18;
    const columnWidth = (availableWidth - gap) / 2;
    const rowHeights = [];

    for (let row = 0; row < Math.ceil(items.length / 2); row += 1) {
      const pair = [items[row * 2], items[row * 2 + 1]].filter(Boolean);
      const maxLines = Math.max(...pair.map((item, offset) => {
        const index = row * 2 + offset + 1;
        const label = `Módulo ${index} - ${item.titulo}`;
        return doc.splitTextToSize(label, columnWidth - 14).length;
      }));
      rowHeights.push(Math.max(23, 14 + maxLines * 4.6));
    }

    let y = 55;
    rowHeights.forEach((rowHeight, row) => {
      for (let col = 0; col < 2; col += 1) {
        const itemIndex = row * 2 + col;
        const item = items[itemIndex];
        if (!item) continue;
        const x = left + col * (columnWidth + gap);
        doc.setFillColor(244, 249, 251);
        doc.setDrawColor(207, 222, 229);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, columnWidth, rowHeight - 4, 2.5, 2.5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.2);
        doc.setTextColor(7, 49, 79);
        const titleLines = doc.splitTextToSize(`Módulo ${itemIndex + 1} - ${item.titulo}`, columnWidth - 12);
        doc.text(titleLines, x + 6, y + 9.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.4);
        doc.setTextColor(75, 88, 98);
        doc.text(`${Number(item.horas || 0)} horas`, x + 6, y + 10.8 + titleLines.length * 4.1);
      }
      y += rowHeight;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(27, 42, 56);
    doc.text(`TOTAL CERTIFICADO: ${items.reduce((sum, item) => sum + Number(item.horas || 0), 0)} HORAS`, left, Math.min(height - 25, y + 7));
  }

  async function build({ sb, cert, aluno, curso, logoUrl, validationUrl }) {
    if (!window.jspdf?.jsPDF) throw new Error('Gerador de PDF não carregado.');
    if (!cert) throw new Error('Certificado não informado.');
    if (String(cert.status || '').toUpperCase() !== 'EMITIDO') throw new Error('O PDF só pode ser gerado quando o certificado estiver EMITIDO.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const studentName = escText(cert.nome_aluno || aluno?.nome, 'ALUNO').toUpperCase();
    const courseName = escText(cert.nome_curso || curso?.titulo, 'Curso');
    const title = escText(cert.titulo_documento, 'CERTIFICADO').toUpperCase();
    const subtitle = escText(cert.subtitulo_documento, 'DE CONCLUSÃO E APROVEITAMENTO').toUpperCase();
    const hours = Math.max(0, Number(cert.horas_emitidas || cert.horas_solicitadas || 0));
    const program = await loadProgram(sb, cert.curso_id, hours, { ...curso, titulo: courseName }, cert.id);
    const logo = await imageToDataUrl(logoUrl || '../3-img/LOGO.png');
    const qr = await qrDataUrl(validationUrl);

    frame(doc, width, height);
    doc.setFillColor(238, 247, 249);
    doc.setDrawColor(192, 211, 220);
    doc.roundedRect(20, 20, 68, 18, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(83, 99, 109);
    doc.text('REGISTRO DO CERTIFICADO', 24, 26);
    doc.setFontSize(8.7);
    doc.setTextColor(7, 49, 79);
    const registryLines = doc.splitTextToSize(String(cert.numero_certificado || cert.codigo_validacao || '—'), 58);
    doc.text(registryLines.slice(0, 2), 24, 32);
    doc.addImage(logo, 'PNG', width - 79, 23, 60, 9, undefined, 'FAST');
    doc.setTextColor(81, 58, 44);
    doc.setFont('times', 'bold');
    doc.setFontSize(title.length > 20 ? 28 : 34);
    doc.text(title, width / 2, 39, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(subtitle, width / 2, 48, { align: 'center' });

    doc.setTextColor(27, 42, 56);
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    doc.text('A ALTITUDE CENTRO UNIVERSITÁRIO certifica que', width / 2, 70, { align: 'center' });
    doc.setFont('times', 'italic');
    doc.setFontSize(studentName.length > 48 ? 24 : 29);
    const nameLines = doc.splitTextToSize(studentName, 225);
    doc.text(nameLines, width / 2, 91, { align: 'center' });
    const afterName = 91 + (nameLines.length - 1) * 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70, 80, 90);
    doc.text(`CPF: ${formatCpf(aluno?.cpf || cert.cpf_aluno)}`, width / 2, afterName + 8, { align: 'center' });

    doc.setFont('times', 'normal');
    doc.setTextColor(27, 42, 56);
    doc.setFontSize(12.5);
    doc.text('concluiu com aproveitamento o curso', width / 2, afterName + 18, { align: 'center' });
    doc.setFont('times', 'bold');
    doc.setTextColor(7, 49, 79);
    doc.setFontSize(20);
    const courseLines = doc.splitTextToSize(courseName, 200);
    doc.text(courseLines, width / 2, afterName + 31, { align: 'center' });
    const afterCourse = afterName + 31 + (courseLines.length - 1) * 8;

    doc.setFont('times', 'normal');
    doc.setTextColor(27, 42, 56);
    doc.setFontSize(11.5);
    doc.text(`com carga horária total de ${hours} horas e nota final de ${Number(cert.nota_final || 0)}%.`, width / 2, afterCourse + 13, { align: 'center' });
    doc.text(`Período acadêmico: ${dateBR(cert.periodo_inicio)} a ${dateBR(cert.periodo_fim || cert.emitido_em)}.`, width / 2, afterCourse + 21, { align: 'center' });

    const signY = height - 36;
    doc.setDrawColor(92, 103, 112);
    doc.line(34, signY, 102, signY);
    doc.line(119, signY, 187, signY);
    doc.setFontSize(9);
    doc.setTextColor(50, 60, 70);
    doc.text('DIREÇÃO DA ALTITUDE CENTRO UNIVERSITÁRIO', 68, signY + 6, { align: 'center' });
    doc.text('CONCLUINTE', 153, signY + 6, { align: 'center' });

    doc.addImage(qr, 'PNG', width - 52, height - 62, 25, 25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(7, 49, 79);
    doc.text('ESCANEIE PARA VALIDAR', width - 39.5, height - 66, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);

    doc.addPage('a4', 'landscape');
    frame(doc, width, height);
    doc.addImage(logo, 'PNG', width - 79, 23, 60, 9, undefined, 'FAST');
    doc.setTextColor(27, 42, 56);
    doc.setFont('times', 'bold');
    doc.setFontSize(25);
    doc.text('CONTEÚDO PROGRAMÁTICO', 28, 38);
    doc.setDrawColor(176, 143, 102);
    doc.setLineWidth(0.7);
    doc.line(28, 44, 145, 44);

    drawProgramItems(doc, program, width, height);

    doc.setFillColor(238, 247, 249);
    doc.roundedRect(width - 77, 54, 56, 89, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(7, 49, 79);
    doc.setFontSize(10);
    doc.text('REGISTRO ACADÊMICO', width - 49, 67, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const legal = [
      `RA: ${aluno?.ra || '—'}`,
      `CPF: ${formatCpf(aluno?.cpf || cert.cpf_aluno)}`,
      `Carga horária certificada: ${hours} horas`,
      `Nota final: ${Number(cert.nota_final || 0)}%`,
      `Emissão: ${dateBR(cert.emitido_em)}`,
      `Versão do PDF: ${Number(cert.versao_pdf || 1)}`,
      'Curso livre de qualificação e atualização.',
      'LDB nº 9.394/96, art. 41, e Decreto nº 5.154/04.',
      'CNPJ: 45.628.030/0001-85'
    ];
    let y = 78;
    legal.forEach((line) => {
      const lines = doc.splitTextToSize(line, 48);
      doc.text(lines, width - 49, y, { align: 'center' });
      y += 7 + (lines.length - 1) * 4;
    });
    doc.addImage(qr, 'PNG', width - 60, 147, 23, 23);
    doc.setFontSize(7);
    doc.text('Autenticidade pelo QR Code', width - 49, 175, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(92, 103, 112);
    doc.text(`Documento nº ${cert.numero_certificado || cert.codigo_validacao} - confirme a autenticidade no Portal Altitude.`, width / 2, height - 16, { align: 'center' });

    return { doc, filename: `certificado-${slug(courseName)}-${slug(studentName)}.pdf`, program };
  }

  window.AltitudeCertificatePDF = {
    build,
    loadProgram,
    async download(options) {
      const { doc, filename } = await build(options);
      doc.save(filename);
    },
    async preview(options) {
      const previewWindow = window.open('', '_blank');
      if (previewWindow) previewWindow.document.write('<!doctype html><title>Preparando certificado...</title><p style="font-family:Arial;padding:24px">Preparando certificado...</p>');
      try {
        const { doc } = await build(options);
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        if (previewWindow) previewWindow.location.href = url;
        else window.open(url, '_blank', 'noopener');
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (error) {
        previewWindow?.close();
        throw error;
      }
    }
  };
})();
