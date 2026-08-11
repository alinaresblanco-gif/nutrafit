import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = Number(process.env.DEFAULT_TIMEOUT_MS || 12000);

const MODELS = {
  primary: process.env.COACH_PRIMARY_MODEL || 'llama3.1:8b',
  factual: process.env.COACH_FACTUAL_MODEL || 'phi3:mini',
  summary: process.env.COACH_SUMMARY_MODEL || 'phi3:mini'
};

function json(res, status, body) {
  const out = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(out);
}

function safeText(value) {
  return String(value || '').trim();
}

function sanitizeResponseText(text) {
  return safeText(text)
    .replace(/^\s*(respuesta_directa|respuesta|lectura[_\s]*rapida|accion[_\s]*ahora|siguiente[_\s]*paso|micro[_\s]*habito|mensaje[_\s]*motivador)\s*:\s*/gim, '')
    .replace(/\b(lectura[_\s]*rapida|accion[_\s]*ahora|siguiente[_\s]*paso|micro[_\s]*habito|mensaje[_\s]*motivador)\s*:/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cropWords(text, maxWords) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return safeText(text);
  return words.slice(0, maxWords).join(' ').trim();
}

function looksMedicalRisk(text) {
  const t = safeText(text).toLowerCase();
  if (!t) return false;
  if (/(suspende|deja|aumenta|reduce|duplica|toma)\s+(la\s+)?(medicacion|medicaci[oó]n|insulina|pastilla|farmaco|f[áa]rmaco)/.test(t)) return true;
  if (/(dosis|mg\b|miligramos|tratamiento prescrito)/.test(t)) return true;
  return false;
}

function parseJsonLoose(content) {
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch {
    const m = String(content).match(/\{[\s\S]*\}/);
    if (!m) return { respuesta_directa: safeText(content) };
    try {
      return JSON.parse(m[0]);
    } catch {
      return { respuesta_directa: safeText(content) };
    }
  }
}

function ensureSchema(raw, question = '') {
  const base = {
    respuesta_directa: '',
    estado_dia: '',
    lectura_rapida: '',
    accion_ahora: '',
    siguiente_paso: '',
    ajuste_creditos: '',
    micro_habito: '',
    mensaje_motivador: ''
  };

  const obj = raw && typeof raw === 'object' ? raw : {};
  for (const key of Object.keys(base)) {
    base[key] = sanitizeResponseText(obj[key]);
  }

  base.respuesta_directa = cropWords(base.respuesta_directa, 90);
  base.accion_ahora = cropWords(base.accion_ahora, 35);
  base.siguiente_paso = cropWords(base.siguiente_paso, 45);
  base.mensaje_motivador = cropWords(base.mensaje_motivador, 24);

  const full = Object.values(base).join(' ');
  if (looksMedicalRisk(full)) {
    return {
      respuesta_directa: 'Por seguridad, no puedo dar indicaciones medicas. Puedo ayudarte con habitos de nutricion y actividad seguros para hoy.',
      estado_dia: '',
      lectura_rapida: '',
      accion_ahora: 'Prioriza una comida simple con proteina y verdura, y mantente hidratada.',
      siguiente_paso: 'Si tienes sintomas o dudas clinicas, consulta a un profesional sanitario.',
      ajuste_creditos: '',
      micro_habito: 'Antes de decidir, revisa tus creditos y elige una accion pequena y segura.',
      mensaje_motivador: 'Avanzar con seguridad tambien es progreso.'
    };
  }

  if (!base.respuesta_directa) {
    const q = safeText(question);
    base.respuesta_directa = q
      ? `Sobre tu pregunta: ${q}. Te doy una orientacion practica y segura con el contexto disponible.`
      : 'Te doy una orientacion practica y segura para tu siguiente decision de hoy.';
  }

  return base;
}

function pickModel(requestedModel, route = '', event = '', mode = '') {
  if (safeText(requestedModel)) return safeText(requestedModel);

  const routeTxt = safeText(route).toLowerCase();
  const eventTxt = safeText(event).toLowerCase();
  const modeTxt = safeText(mode).toLowerCase();

  if (routeTxt === 'factual') return MODELS.factual;
  if (eventTxt === 'resumen_semanal' || eventTxt === 'cierre_dia' || modeTxt === 'resumen') return MODELS.summary;
  return MODELS.primary;
}

function buildSystemPrompt(payload) {
  const given = safeText(payload.system_prompt);
  if (given) return given;

  if (safeText(payload.route).toLowerCase() === 'factual') {
    return 'Eres el asistente factual de NutraFit. Responde directo y en espanol claro. Devuelve solo JSON valido con las claves obligatorias de NutraFit.';
  }

  return 'Eres NUTRACOACH de NutraFit. Ayuda con nutricion, ejercicio y gestion de creditos de forma segura y accionable. Devuelve solo JSON valido con las claves obligatorias de NutraFit.';
}

function buildUserPrompt(payload) {
  const question = safeText(payload.question) || 'Necesito una recomendacion util para este momento.';
  const profile = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};

  return [
    'PREGUNTA_USUARIO:',
    question,
    '',
    'PERFIL_JSON:',
    JSON.stringify(profile),
    '',
    'CONTEXTO_JSON:',
    JSON.stringify(context),
    '',
    'FORMATO_OBLIGATORIO_JSON:',
    '{"respuesta_directa":"","estado_dia":"","lectura_rapida":"","accion_ahora":"","siguiente_paso":"","ajuste_creditos":"","micro_habito":"","mensaje_motivador":""}'
  ].join('\n');
}

async function callOllama(payload) {
  const model = pickModel(payload.model, payload.route, payload.event, payload.mode);
  const system = buildSystemPrompt(payload);
  const userPrompt = safeText(payload.user_prompt) || buildUserPrompt(payload);

  const body = {
    model,
    stream: false,
    format: {
      type: 'object',
      properties: {
        respuesta_directa: { type: 'string' },
        estado_dia: { type: 'string' },
        lectura_rapida: { type: 'string' },
        accion_ahora: { type: 'string' },
        siguiente_paso: { type: 'string' },
        ajuste_creditos: { type: 'string' },
        micro_habito: { type: 'string' },
        mensaje_motivador: { type: 'string' }
      },
      required: [
        'respuesta_directa',
        'estado_dia',
        'lectura_rapida',
        'accion_ahora',
        'siguiente_paso',
        'ajuste_creditos',
        'micro_habito',
        'mensaje_motivador'
      ]
    },
    options: {
      temperature: Number(payload.temperature || 0.35)
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt }
    ]
  };

  const timeoutMs = Number(payload.timeout_ms || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const out = JSON.parse(text);
    const content = safeText(out?.message?.content);
    const parsed = parseJsonLoose(content);
    const normalized = ensureSchema(parsed, payload.question);

    return {
      ok: true,
      model,
      usage: {
        prompt_tokens: Number(out?.prompt_eval_count || 0),
        completion_tokens: Number(out?.eval_count || 0),
        total_tokens: Number((out?.prompt_eval_count || 0) + (out?.eval_count || 0))
      },
      response_json: normalized
    };
  } finally {
    clearTimeout(timer);
  }
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    json(res, 204, { ok: true });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/health') {
    json(res, 200, {
      status: 'ok',
      service: 'nutrafit-coach-proxy',
      ollama_base_url: OLLAMA_BASE_URL,
      models: MODELS
    });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/coach') {
    try {
      const rawBody = await collectBody(req);
      const payload = JSON.parse(rawBody || '{}');
      const result = await callOllama(payload);

      json(res, 200, {
        status: 'ok',
        provider: 'ollama',
        model: result.model,
        usage: result.usage,
        response_json: result.response_json
      });
      return;
    } catch (err) {
      const fallback = ensureSchema({}, '');
      json(res, 200, {
        status: 'ok',
        provider: 'ollama',
        warning: 'fallback',
        error: safeText(err?.message || err),
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        response_json: fallback
      });
      return;
    }
  }

  json(res, 404, { status: 'error', message: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[nutrafit-coach-proxy] listening on ${PORT}`);
  console.log(`[nutrafit-coach-proxy] ollama: ${OLLAMA_BASE_URL}`);
});
