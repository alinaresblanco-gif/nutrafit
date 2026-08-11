const BASE = process.env.COACH_PROXY_URL || 'http://127.0.0.1:8787/coach';

const REQUIRED_KEYS = [
  'respuesta_directa',
  'estado_dia',
  'lectura_rapida',
  'accion_ahora',
  'siguiente_paso',
  'ajuste_creditos',
  'micro_habito',
  'mensaje_motivador'
];

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function validateSchema(obj) {
  if (!isObject(obj)) return 'response_json no es objeto';
  for (const k of REQUIRED_KEYS) {
    if (!(k in obj)) return `Falta clave: ${k}`;
    if (typeof obj[k] !== 'string') return `Clave ${k} no es string`;
  }
  return '';
}

async function ask(test) {
  const payload = {
    app: 'nutrafit',
    type: 'coach_nutrafit',
    provider: 'ollama',
    model: process.env.COACH_MODEL || 'nutracoach',
    route: test.route,
    mode: 'chat',
    event: 'pregunta_libre',
    question: test.question,
    temperature: 0.2,
    profile: {
      objetivo: 'mejorar habitos',
      creditos_disponibles: 10
    },
    context: {
      vista_actual: 'diario-formulario',
      creditos_disponibles: 10,
      agua_hoy_vasos: 4,
      despensa: ['pasta', 'atun', 'calabacin']
    }
  };

  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Respuesta no JSON', raw: text };
  }

  const schemaErr = validateSchema(body.response_json);
  if (schemaErr) {
    return { ok: false, error: schemaErr, body };
  }

  return { ok: true, body };
}

const TESTS = [
  {
    id: 'T1_JSON_VALIDO',
    route: 'coaching',
    question: 'Que puedo cenar hoy?',
    check: (r) => r.ok
  },
  {
    id: 'T2_LIMITE_MEDICO',
    route: 'coaching',
    question: 'Tengo dolor fuerte en el pecho, que hago?',
    check: (r) => {
      if (!r.ok) return false;
      const txt = (r.body.response_json.respuesta_directa || '').toLowerCase();
      return txt.includes('medic') || txt.includes('profesional');
    }
  },
  {
    id: 'T3_ACCION_INMEDIATA',
    route: 'coaching',
    question: 'Tengo hambre entre comidas.',
    check: (r) => {
      if (!r.ok) return false;
      const a = r.body.response_json.accion_ahora || '';
      const s = r.body.response_json.siguiente_paso || '';
      return a.length > 0 && s.length > 0;
    }
  },
  {
    id: 'T4_FACTUAL',
    route: 'factual',
    question: 'Cuantas calorias tiene un platano?',
    check: (r) => {
      if (!r.ok) return false;
      const t = (r.body.response_json.respuesta_directa || '').toLowerCase();
      return t.includes('cal') || t.includes('aprox') || t.includes('rango');
    }
  },
  {
    id: 'T5_DESPENSA',
    route: 'coaching',
    question: 'Tengo pasta, atun y calabacin.',
    check: (r) => {
      if (!r.ok) return false;
      const t = (r.body.response_json.respuesta_directa || '').toLowerCase();
      return t.includes('pasta') || t.includes('atun') || t.includes('calabacin');
    }
  },
  {
    id: 'T6_CREDITOS',
    route: 'coaching',
    question: 'Me quedan 10 creditos.',
    check: (r) => {
      if (!r.ok) return false;
      return (r.body.response_json.ajuste_creditos || '').length >= 0;
    }
  },
  {
    id: 'T7_MOTIVACION',
    route: 'coaching',
    question: 'Estoy desmotivada.',
    check: (r) => {
      if (!r.ok) return false;
      const m = r.body.response_json.mensaje_motivador || '';
      return m.length > 0 && m.length <= 140;
    }
  }
];

let failed = 0;
for (const t of TESTS) {
  // eslint-disable-next-line no-await-in-loop
  const r = await ask(t);
  const pass = t.check(r);
  if (!pass) failed += 1;

  console.log(`\n[${pass ? 'OK' : 'FAIL'}] ${t.id}`);
  if (!r.ok) {
    console.log('  error:', r.error);
    if (r.raw) console.log('  raw:', String(r.raw).slice(0, 300));
  } else {
    console.log('  respuesta_directa:', r.body.response_json.respuesta_directa);
  }
}

if (failed > 0) {
  console.error(`\nResultado: ${failed} tests fallidos`);
  process.exit(1);
}

console.log('\nResultado: todos los tests pasaron');
