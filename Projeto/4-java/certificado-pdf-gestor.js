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

  async function loadModules(sb, courseId, totalHours) {
    if (!sb || !courseId) return [];
    const { data, error } = await sb
      .from('modulos')
      .select('id,titulo,ordem,carga_horaria')
      .eq('curso_id', Number(courseId))
      .order('ordem', { ascending: true });
    if (error) throw error;
    const modules = data || [];
    if (!modules.length) return [];
    const explicit = modules.reduce((sum, item) => sum + Number(item.carga_horaria || 0), 0);
    const defaultHours = explicit ? 0 : Math.floor(Number(totalHours || 0) / modules.length);
    let remaining = Number(totalHours || 0);
    return modules.map((item, index) => {
      let hours = Number(item.carga_horaria || defaultHours || 0);
      if (!explicit && index === modules.length - 1) hours = Math.max(0, remaining);
      remaining -= hours;
      return { titulo: item.titulo || `Módulo ${index + 1}`, horas: hours };
    });
  }

  async function build({ sb, cert, aluno, curso, logoUrl, validationUrl }) {
    if (!window.jspdf?.jsPDF) throw new Error('Gerador de PDF não carregado.');
    if (!cert) throw new Error('Certificado não informado.');
    if (String(cert.status || '').toUpperCase() !== 'EMITIDO') {
      throw new Error('O PDF só pode ser gerado quando o certificado estiver EMITIDO.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const studentName = escText(cert.nome_aluno || aluno?.nome, 'ALUNO').toUpperCase();
    const courseName = escText(cert.nome_curso || curso?.titulo, 'Curso');
    const title = escText(cert.titulo_documento, 'CERTIFICADO').toUpperCase();
    const subtitle = escText(cert.subtitulo_documento, 'DE CONCLUSÃO E APROVEITAMENTO').toUpperCase();
    const hours = Number(cert.horas_emitidas || cert.horas_solicitadas || curso?.carga_horaria || 0);
    const modules = await loadModules(sb, cert.curso_id, hours);
    const logo = await imageToDataUrl(logoUrl || '../3-img/LOGO.png');
    const qr = await qrDataUrl(validationUrl);

    frame(doc, width, height);
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
    doc.text('O Instituto de Educação e Tecnologia Altitude certifica que', width / 2, 70, { align: 'center' });
    doc.setFont('times', 'italic');
    doc.setFontSize(studentName.length > 48 ? 24 : 29);
    const nameLines = doc.splitTextToSize(studentName, 225);
    doc.text(nameLines, width / 2, 91, { align: 'center' });
    const afterName = 91 + (nameLines.length - 1) * 10;

    doc.setFont('times', 'normal');
    doc.setFontSize(12.5);
    doc.text('concluiu com aproveitamento o curso', width / 2, afterName + 15, { align: 'center' });
    doc.setFont('times', 'bold');
    doc.setTextColor(7, 49, 79);
    doc.setFontSize(20);
    const courseLines = doc.splitTextToSize(courseName, 200);
    doc.text(courseLines, width / 2, afterName + 28, { align: 'center' });
    const afterCourse = afterName + 28 + (courseLines.length - 1) * 8;

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
    doc.text('DIREÇÃO DO INSTITUTO ALTITUDE', 68, signY + 6, { align: 'center' });
    doc.text('CONCLUINTE', 153, signY + 6, { align: 'center' });

    doc.addImage(qr, 'PNG', width - 52, height - 62, 25, 25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(7, 49, 79);
    doc.text('ESCANEIE PARA VALIDAR', width - 39.5, height - 66, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.text(cert.numero_certificado || String(cert.codigo_validacao), width / 2, height - 16, { align: 'center' });

    doc.addPage('a4', 'landscape');
    frame(doc, width, height);
    doc.addImage(logo, 'PNG', width - 79, 23, 60, 9, undefined, 'FAST');
    doc.setTextColor(27, 42, 56);
    doc.setFont('times', 'bold');
    doc.setFontSize(25);
    doc.text('CONTEÚDO PROGRAMÁTICO', 45, 39);
    doc.setDrawColor(176, 143, 102);
    doc.setLineWidth(0.7);
    doc.line(45, 44, 148, 44);

    const items = modules.length ? modules : [{ titulo: courseName, horas: hours }];
    const half = Math.ceil(items.length / 2);
    [items.slice(0, half), items.slice(half)].forEach((column, col) => {
      let y = 60;
      column.forEach((item, index) => {
        doc.setFont('times', 'bold');
        doc.setFontSize(9.4);
        doc.setTextColor(7, 49, 79);
        doc.text(`${col * half + index + 1}.`, [28, 116][col], y);
        doc.setFont('times', 'normal');
        doc.setTextColor(30, 42, 54);
        const label = `${item.titulo}${item.horas ? ` (${item.horas} horas)` : ''}`;
        const lines = doc.splitTextToSize(label, 82);
        doc.text(lines, [36, 124][col], y);
        y += 7.5 + (lines.length - 1) * 4.5;
      });
    });

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

    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(27, 42, 56);
    doc.text(`TOTAL CERTIFICADO: ${hours} HORAS`, 29, height - 27);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(92, 103, 112);
    doc.text(`Documento nº ${cert.numero_certificado || cert.codigo_validacao} - confirme a autenticidade no Portal Altitude.`, width / 2, height - 16, { align: 'center' });

    return { doc, filename: `certificado-${slug(courseName)}-${slug(studentName)}.pdf` };
  }

  window.AltitudeCertificatePDF = {
    async download(options) {
      const { doc, filename } = await build(options);
      doc.save(filename);
    },
    async preview(options) {
      const previewWindow = window.open('', '_blank');
      if (previewWindow) {
        previewWindow.document.write('<!doctype html><title>Preparando certificado...</title><p style="font-family:Arial;padding:24px">Preparando certificado...</p>');
      }
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
