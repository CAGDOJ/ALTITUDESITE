import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
});

const slugify = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70);

const normalizeText = (text = '') => text
  .replace(/[–—]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/•/g, '-')
  .replace(/[^\u0000-\u00FF\n\r\t]/g, '');

function wrapText(text: string, maxChars = 90): string[] {
  const out: string[] = [];
  for (const paragraph of normalizeText(text).split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) { out.push(line); line = word; }
      else line = next;
    }
    if (line) out.push(line);
    out.push('');
  }
  return out;
}

async function createModulePdf(title: string, courseTitle: string, content: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 54;
  const lineHeight = 15;
  let page = pdf.addPage(pageSize);
  let y = 786;

  const newPage = () => { page = pdf.addPage(pageSize); y = 786; };
  const drawFooter = () => {
    const pages = pdf.getPages();
    pages.forEach((p, index) => p.drawText(`Instituicao Altitude | ${normalizeText(courseTitle)} | Pagina ${index + 1}/${pages.length}`, {
      x: margin, y: 24, size: 8, font: regular, color: rgb(.38, .43, .49),
    }));
  };

  page.drawText('INSTITUICAO ALTITUDE', { x: margin, y, size: 17, font: bold, color: rgb(.03, .18, .35) });
  y -= 28;
  for (const line of wrapText(title, 62).filter(Boolean)) {
    page.drawText(line, { x: margin, y, size: 16, font: bold, color: rgb(.06, .24, .42) });
    y -= 20;
  }
  page.drawLine({ start: { x: margin, y: y - 2 }, end: { x: 541, y: y - 2 }, thickness: 1.3, color: rgb(.05, .65, .64) });
  y -= 28;

  for (const line of wrapText(content, 90)) {
    if (y < 58) newPage();
    if (!line) { y -= 7; continue; }
    page.drawText(line, { x: margin, y, size: 10.5, font: regular, color: rgb(.12, .15, .2) });
    y -= lineHeight;
  }
  drawFooter();
  return pdf.save();
}

type GeneratedCourse = {
  titulo: string;
  descricao: string;
  publico_alvo: string;
  objetivos: string[];
  modulos: Array<{ titulo: string; descricao: string; conteudo: string }>;
  prova: { titulo: string; questoes: Array<{ enunciado: string; a: string; b: string; c: string; d: string; correta: 'A'|'B'|'C'|'D'; explicacao: string }> };
  prompt_capa: string;
};

function extractOutputText(response: any): string {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  throw new Error('A OpenAI nao retornou o JSON do curso.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !OPENAI_API_KEY) return json({ error: 'Secrets do servidor nao configurados.' }, 500);

  const authorization = req.headers.get('Authorization') || '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: authorization } } });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Entre no Portal de Gestao para usar a IA.' }, 401);

  const allowedEmails = (Deno.env.get('GESTOR_EMAILS') || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (allowedEmails.length && !allowedEmails.includes((user.email || '').toLowerCase())) return json({ error: 'Usuario sem permissao para criar cursos com IA.' }, 403);

  let createdCourseId: number | null = null;
  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    const carga = Math.max(1, Math.min(2000, Number(body.carga_horaria) || 20));
    const nivel = ['BASICO','INTERMEDIARIO','AVANCADO'].includes(body.nivel) ? body.nivel : 'BASICO';
    const moduleCount = Math.max(2, Math.min(12, Number(body.quantidade_modulos) || 5));
    const questionCount = Math.max(5, Math.min(30, Number(body.quantidade_questoes) || 10));
    const categoria = String(body.categoria || 'TECNOLOGIA').toUpperCase();
    const generateCover = body.gerar_capa !== false;
    if (prompt.length < 20) return json({ error: 'Descreva melhor o curso desejado.' }, 400);

    const schema = {
      type: 'object', additionalProperties: false,
      required: ['titulo','descricao','publico_alvo','objetivos','modulos','prova','prompt_capa'],
      properties: {
        titulo: { type: 'string' }, descricao: { type: 'string' }, publico_alvo: { type: 'string' },
        objetivos: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 },
        prompt_capa: { type: 'string' },
        modulos: { type: 'array', minItems: moduleCount, maxItems: moduleCount, items: {
          type: 'object', additionalProperties: false, required: ['titulo','descricao','conteudo'],
          properties: { titulo: { type: 'string' }, descricao: { type: 'string' }, conteudo: { type: 'string' } }
        }},
        prova: { type: 'object', additionalProperties: false, required: ['titulo','questoes'], properties: {
          titulo: { type: 'string' }, questoes: { type: 'array', minItems: questionCount, maxItems: questionCount, items: {
            type: 'object', additionalProperties: false, required: ['enunciado','a','b','c','d','correta','explicacao'],
            properties: {
              enunciado:{type:'string'}, a:{type:'string'}, b:{type:'string'}, c:{type:'string'}, d:{type:'string'},
              correta:{type:'string',enum:['A','B','C','D']}, explicacao:{type:'string'}
            }
          }}
        }}
      }
    };

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_TEXT_MODEL') || 'gpt-5-mini',
        input: [
          { role: 'system', content: 'Voce e um designer instrucional brasileiro. Crie cursos corretos, didaticos, inclusivos e adequados ao nivel solicitado. O conteudo de cada modulo deve ser substancial, claro, em portugues do Brasil, pronto para leitura e sem inventar leis, normas ou dados. Inclua explicacoes uteis nas questoes. Nao inclua texto de certificado.' },
          { role: 'user', content: `Pedido: ${prompt}\nCarga horaria: ${carga} horas. Nivel: ${nivel}. Categoria: ${categoria}. Modulos: ${moduleCount}. Questoes: ${questionCount}.` }
        ],
        text: { format: { type: 'json_schema', name: 'curso_altitude', strict: true, schema } }
      })
    });
    const aiJson = await aiResponse.json();
    if (!aiResponse.ok) throw new Error(aiJson?.error?.message || 'Falha na geracao do curso.');
    const generated = JSON.parse(extractOutputText(aiJson)) as GeneratedCourse;

    let coverUrl: string | null = null;
    if (generateCover) {
      const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-1-mini',
          prompt: `Capa horizontal profissional para curso educacional da Instituicao Altitude. Tema: ${generated.prompt_capa}. Sem logotipos, sem marcas, sem texto pequeno, sem certificado. Composicao limpa, moderna, confiavel, azul profundo e ciano como acentos, espaco visual para titulo.`,
          size: '1536x1024', quality: 'medium', output_format: 'png'
        })
      });
      const imageJson = await imageResponse.json();
      if (imageResponse.ok && imageJson?.data?.[0]?.b64_json) {
        const bytes = Uint8Array.from(atob(imageJson.data[0].b64_json), c => c.charCodeAt(0));
        const path = `ia/${Date.now()}-${slugify(generated.titulo)}.png`;
        const { error } = await admin.storage.from('capas_cursos').upload(path, bytes, { contentType: 'image/png', upsert: false });
        if (!error) coverUrl = admin.storage.from('capas_cursos').getPublicUrl(path).data.publicUrl;
      }
    }

    const courseDescription = `${generated.descricao}\n\nPublico-alvo: ${generated.publico_alvo}\nObjetivos: ${generated.objetivos.join('; ')}`;
    const { data: course, error: courseError } = await admin.from('cursos').insert({
      titulo: generated.titulo, descricao: courseDescription, categoria, carga_horaria: carga,
      capa_url: coverUrl, publicado: false, nivel, nota_minima: 70, gerado_por_ia: true,
      slug: `${slugify(generated.titulo)}-${Date.now().toString().slice(-6)}`
    }).select('id,titulo').single();
    if (courseError) throw courseError;
    createdCourseId = course.id;

    const moduleRows = generated.modulos.map((module, index) => ({
      curso_id: course.id, titulo: module.titulo, descricao: module.descricao,
      resumo: module.descricao, conteudo: module.conteudo, ordem: index + 1, publicado: false
    }));
    const { data: modules, error: moduleError } = await admin.from('modulos').insert(moduleRows).select('id,titulo,conteudo,ordem');
    if (moduleError || !modules) throw moduleError || new Error('Nao foi possivel criar os modulos.');

    for (const module of modules) {
      try {
        const bytes = await createModulePdf(module.titulo, generated.titulo, module.conteudo || '');
        const path = `${course.id}/${module.id}/apostila-${slugify(module.titulo)}.pdf`;
        const { error: uploadError } = await admin.storage.from('materiais_cursos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        if (uploadError) continue;
        const pdfUrl = admin.storage.from('materiais_cursos').getPublicUrl(path).data.publicUrl;
        await Promise.all([
          admin.from('modulos').update({ pdf_url: pdfUrl }).eq('id', module.id),
          admin.from('materiais').insert({ curso_id: course.id, modulo_id: module.id, tipo: 'PDF', titulo: `Apostila - ${module.titulo}`, url: pdfUrl })
        ]);
      } catch (pdfError) { console.error('PDF:', pdfError); }
    }

    const finalModule = modules[modules.length - 1];
    const { data: test, error: testError } = await admin.from('provas').insert({
      curso_id: course.id, modulo_id: finalModule.id, titulo: generated.prova.titulo
    }).select('id').single();
    if (testError) throw testError;
    const { error: questionError } = await admin.from('questoes').insert(generated.prova.questoes.map(q => ({ prova_id: test.id, ...q })));
    if (questionError) throw questionError;

    await admin.from('curso_ia_rascunhos').insert({ criado_por: user.id, pedido: prompt, dados: generated, curso_id: course.id, status: 'GERADO' });
    return json({ ok: true, curso_id: course.id, titulo: course.titulo, capa_url: coverUrl, modulos: modules.length, questoes: generated.prova.questoes.length, publicado: false });
  } catch (error) {
    console.error(error);
    if (createdCourseId) {
      await admin.from('curso_ia_rascunhos').insert({ criado_por: user.id, pedido: 'Falha durante a geracao', dados: {}, curso_id: createdCourseId, status: 'ERRO', erro: String(error?.message || error) });
    }
    return json({ error: error?.message || 'Erro inesperado ao criar o curso.' }, 500);
  }
});
