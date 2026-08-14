/**
 * Coach pipeline extractivo para despliegue en nube.
 * Este archivo recoge la parte del coach que se necesita para publicar
 * el flujo de IA fuera del script principal de NutraFit.
 *
 * ROL:
 * - Leer las propiedades configuradas para Gems/Proxy.
 * - Seleccionar proveedor y modelo.
 * - Construir el prompt con contexto del usuario.
 * - Llamar a Gemini o proxy Ollama.
 * - Normalizar la respuesta JSON y devolver fallback seguro.
 */

const COACH_PIPELINE_EXTRACT_VERSION = "2026-08-14";

const COACH_PIPELINE_EXTRACT_PROMPT_MAESTRO = [
  "Rol:",
  "Eres Coach NutraFit de nutricion y actividad fisica.",
  "Tu objetivo es ayudar a la usuaria a tomar la siguiente mejor decision hoy.",
  "",
  "Reglas:",
  "- Responde siempre en espanol claro.",
  "- Usa tono cercano y practico, sin sermones.",
  "- Prioriza accion inmediata, realista y segura.",
  "- Adapta recomendaciones a creditos, agua, ejercicio y objetivo cuando haya datos.",
  "- Si faltan datos para afinar, pide solo el dato minimo faltante.",
  "- No inventes datos nutricionales exactos si no hay evidencia suficiente en contexto.",
  "- No des diagnosticos ni tratamientos medicos.",
  "- Si la consulta es clinica o medica, indica limite y recomienda consulta profesional.",
  "",
  "Formato obligatorio:",
  "Devuelve SOLO JSON valido con estas claves:",
  "respuesta_directa, estado_dia, lectura_rapida, accion_ahora, siguiente_paso, ajuste_creditos, micro_habito, mensaje_motivador",
  "",
  "Restricciones de calidad:",
  "- respuesta_directa: concreta y breve (ideal < 90 palabras).",
  "- accion_ahora: accion ejecutable en menos de 10 minutos.",
  "- siguiente_paso: accion para las proximas 3-6 horas.",
  "- mensaje_motivador: breve, util y sin frases vacias.",
  "",
  "Seguridad:",
  "- Nunca devuelvas enlaces ni bloque de fuentes en la respuesta final al usuario.",
  "- No rompas el formato JSON obligatorio."
].join("\n");

const COACH_PIPELINE_EXTRACT_PROMPT_FACTUAL = [
  "Rol:",
  "Eres asistente factual de NutraFit.",
  "",
  "Reglas:",
  "- Responde de forma directa, clara y util.",
  "- Prioriza base oficial interna cuando exista.",
  "- Si falta precision de alimento, cantidad o contexto, da rango prudente y pide el dato minimo para afinar.",
  "- No bloquees la respuesta con 'no tengo evidencia' si puedes dar orientacion general segura.",
  "- No des diagnosticos ni tratamientos medicos.",
  "",
  "Formato obligatorio:",
  "Devuelve SOLO JSON valido con estas claves:",
  "respuesta_directa, estado_dia, lectura_rapida, accion_ahora, siguiente_paso, ajuste_creditos, micro_habito, mensaje_motivador",
  "",
  "Foco:",
  "- Prioriza el contenido principal en respuesta_directa.",
  "- Mantiene compatibilidad de esquema con el coach.",
  "- No rompas el formato JSON obligatorio."
].join("\n");

const COACH_PIPELINE_EXTRACT_MODELOS_GEMINI_FALLBACK = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest"
];

const COACH_PIPELINE_EXTRACT_BASE_OFICIAL = [
  {
    id: "hidratos_orientativos",
    categorias: ["nutricion_general", "comidas", "ejercicio"],
    etiquetas: ["hidratos", "carbohidratos", "cantidad diaria", "energia", "entrenamiento"],
    contenido: "La cantidad de hidratos puede ajustarse por objetivo y actividad: en orientacion general, menor actividad suele encajar con rangos mas bajos y entrenamientos frecuentes con rangos mas altos.",
    fuentes: ["USDA", "WHO", "ACSM"]
  },
  {
    id: "proteina_perdida_grasa",
    categorias: ["nutricion_general", "ejercicio"],
    etiquetas: ["proteina", "musculo", "perder grasa", "entreno"],
    contenido: "La evidencia general en adultos activos suele situar la ingesta de proteina en torno a 1,2-2,0 g/kg/dia segun objetivo, nivel de entrenamiento y contexto energetico.",
    fuentes: ["NIH", "USDA", "ACSM"]
  },
  {
    id: "fibra_saciedad",
    categorias: ["nutricion_general", "alimentos", "comidas"],
    etiquetas: ["fibra", "saciedad", "hambre", "legumbres", "fruta"],
    contenido: "Los alimentos ricos en fibra suelen mejorar la saciedad y ayudar al control del apetito.",
    fuentes: ["WHO", "FAO", "Harvard Nutrition Source"]
  },
  {
    id: "hidratacion_general",
    categorias: ["agua", "ejercicio"],
    etiquetas: ["agua", "hidratacion", "sudar", "ejercicio"],
    contenido: "La hidratacion debe repartirse a lo largo del dia y aumentar con calor, sudoracion y ejercicio.",
    fuentes: ["CDC", "Mayo Clinic", "ACSM"]
  }
];

const COACH_PIPELINE_EXTRACT_EJEMPLOS = [
  { categoria: "planificacion", pregunta: "Dame un plan rapido de hoy con poco tiempo", respuesta_esperada: "Prefiere desayuno con proteina y fruta, comida con proteina magra y verdura, y cena ligera con proteina de calidad." },
  { categoria: "nutrafit_usuario", pregunta: "Con mis creditos de hoy, como reparto desayuno comida y cena?", respuesta_esperada: "Reserva una parte moderada para desayuno, la mayor parte para comida y una cena ligera rica en proteina." },
  { categoria: "alimentos", pregunta: "Que beneficios tiene la chia y cuanta cantidad diaria recomiendas?", respuesta_esperada: "La chia aporta fibra, omega-3 vegetal y saciedad; una cantidad util es 1 a 2 cucharadas al dia, repartidas." },
  { categoria: "comportamiento", pregunta: "Tengo ansiedad por dulce por la tarde, que hago en 10 minutos?", respuesta_esperada: "Pausa, bebe agua, muévete un poco y elige un snack con proteina o fibra para frenar el impulso." },
  { categoria: "seguridad", pregunta: "Tengo hipertension, que tratamiento nutricional debo seguir?", respuesta_esperada: "Soy un coach nutricional, no un profesional medico." }
];

function coachPipelineExtractConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    provider: coachPipelineNormalizeProvider(props.getProperty("NUTRAFIT_COACH_PROVIDER") || "offline"),
    ollamaProxyUrl: String(props.getProperty("NUTRAFIT_COACH_OLLAMA_PROXY_URL") || "").trim(),
    geminiApiKey: String(props.getProperty("NUTRAFIT_COACH_GEMINI_API_KEY") || "").trim(),
    geminiModel: String(props.getProperty("NUTRAFIT_COACH_GEMINI_MODEL") || "gemini-2.5-flash").trim(),
    modelPrimary: String(props.getProperty("NUTRAFIT_COACH_OLLAMA_MODEL_PRIMARY") || props.getProperty("NUTRAFIT_COACH_MODEL_PRIMARY") || "llama3.1:8b").trim(),
    modelFactual: String(props.getProperty("NUTRAFIT_COACH_OLLAMA_MODEL_FACTUAL") || "phi3:mini").trim(),
    modelSummary: String(props.getProperty("NUTRAFIT_COACH_OLLAMA_MODEL_SUMMARY") || props.getProperty("NUTRAFIT_COACH_MODEL_SUMMARY") || "phi3:mini").trim(),
    maxTokensSalida: Number(props.getProperty("NUTRAFIT_COACH_MAX_TOKENS") || 240),
    timeoutMs: Number(props.getProperty("NUTRAFIT_COACH_TIMEOUT_MS") || 12000),
    canaryUsers: coachPipelineParseList(props.getProperty("NUTRAFIT_COACH_CANARY_USERS") || "")
  };
}

function coachPipelineNormalizeProvider(providerRaw) {
  var value = String(providerRaw || "").trim().toLowerCase();
  if (value === "ollama") return "ollama";
  if (value === "gemini") return "gemini";
  return "offline";
}

function coachPipelineParseList(texto) {
  return String(texto || "")
    .split(/[;,\s]+/)
    .map(function(item) { return String(item || "").trim().toLowerCase(); })
    .filter(function(item) { return item.length > 0; });
}

function coachPipelineIsUserInCanary(usuarioId, canaryUsers) {
  var uid = String(usuarioId || "").trim().toLowerCase();
  if (!uid) return false;
  return (Array.isArray(canaryUsers) ? canaryUsers : []).indexOf(uid) >= 0;
}

function coachPipelineExtractResolveProvider(cfg, usuarioId, esModoTestInterno, payload) {
  var forcedProvider = coachPipelineNormalizeProvider(payload && payload.force_provider);
  if (esModoTestInterno && forcedProvider) {
    return forcedProvider;
  }

  var providerCfg = coachPipelineNormalizeProvider(cfg && cfg.provider);
  if (providerCfg === "offline") return "offline";
  if (providerCfg === "ollama" && (!cfg || !cfg.ollamaProxyUrl)) return "offline";
  if (providerCfg === "gemini" && (!cfg || !cfg.geminiApiKey)) return "offline";

  var canary = Array.isArray(cfg && cfg.canaryUsers) ? cfg.canaryUsers : [];
  if (canary.length && !coachPipelineIsUserInCanary(usuarioId, canary)) return "offline";
  return providerCfg;
}

function coachPipelineExtractChooseModel(evento, payload, cfg, rutaRespuesta, modo) {
  var evt = String(evento || "").toLowerCase();
  var modoTxt = String(modo || "").toLowerCase();
  var ruta = String(rutaRespuesta || "coaching").toLowerCase();
  var forzarResumen = Boolean(payload && payload.usar_modelo_70b) || Boolean(payload && payload.usar_modelo_resumen) || evt === "resumen_semanal" || evt === "cierre_dia" || modoTxt === "resumen";

  if (coachPipelineNormalizeProvider(cfg && cfg.provider) === "gemini") return cfg.geminiModel;
  if (forzarResumen) return cfg.modelSummary;
  if (ruta === "factual") return cfg.modelFactual;
  return cfg.modelPrimary;
}

function coachPipelineExtractClassifyRoute(pregunta, evento, modo, intencion) {
  var preguntaTxt = String(pregunta || "").trim().toLowerCase();
  var eventoTxt = String(evento || "").trim().toLowerCase();
  var modoTxt = String(modo || "").trim().toLowerCase();
  var intencionTxt = String(intencion || "").trim().toLowerCase();

  if (!(eventoTxt === "pregunta_libre" || modoTxt === "chat")) return "coaching";
  if (intencionTxt === "plan_hoy" || intencionTxt === "motivacion") return "coaching";

  if (/cuant[oa]s?|cuanta|debo|deberia|me toca|mi caso|para mi|menu|plan|reparto|hoy|kg\b|peso/.test(preguntaTxt)) {
    return "coaching";
  }

  if (/que es|beneficio|beneficios|riesgo|riesgos|vitamina|mineral|omega|indice glucemico|colesterol|trigliceridos|contraindic/.test(preguntaTxt)) {
    return "factual";
  }

  if (["nutricion_general"].indexOf(intencionTxt) >= 0) {
    return "factual";
  }

  return "coaching";
}

function coachPipelineExtractBuildPrompt(pregunta, evento, contexto, rutaRespuesta, modo) {
  var baseOficial = Array.isArray(contexto && contexto.base_oficial_coach) ? contexto.base_oficial_coach : COACH_PIPELINE_EXTRACT_BASE_OFICIAL;
  var ejemplos = Array.isArray(contexto && contexto.ejemplos_calibracion) ? contexto.ejemplos_calibracion : COACH_PIPELINE_EXTRACT_EJEMPLOS;
  var contextoJson = contexto || {};

  var bloque = [
    rutaRespuesta === "factual" ? "MODO_FACTUAL_ACTIVO:" : "REGLA_IMPORTANTE:",
    rutaRespuesta === "factual" ? "Responder con consenso de fuentes seguras." : "Responde directo, sin rodeos y sin etiquetas dentro de respuesta_directa.",
    "Mantiene el formato JSON obligatorio.",
    "Prioriza accion inmediata y realista.",
    "No inventes datos nutricionales exactos si no hay evidencia.",
    "Si faltan peso, altura, edad o sexo y te piden calculo personalizado, pide esos datos antes de calcular.",
    "No des diagnosticos ni tratamientos medicos. Si la consulta es medica, indica limite y recomienda consulta profesional.",
    "",
    "PREGUNTA_USUARIO:",
    pregunta || "Necesito recomendacion para este momento.",
    "",
    "EVENTO:",
    String(evento || "pregunta_libre"),
    "",
    "MODO:",
    String(modo || "auto"),
    "",
    "BASE_OFICIAL_COACH:",
    coachPipelineFormatBase(baseOficial),
    "",
    "EJEMPLOS_CALIBRACION:",
    coachPipelineFormatExamples(ejemplos),
    "",
    "CONTEXTO_JSON:",
    JSON.stringify(contextoJson, null, 2)
  ];

  return bloque.join("\n");
}

function coachPipelineFormatBase(items) {
  var lista = Array.isArray(items) ? items : [];
  if (!lista.length) return "Sin fichas oficiales internas.";

  return lista.map(function(item) {
    return [
      "- Id: " + String(item.id || ""),
      "  Categorias: " + (Array.isArray(item.categorias) ? item.categorias.join(", ") : ""),
      "  Etiquetas: " + (Array.isArray(item.etiquetas) ? item.etiquetas.join(", ") : ""),
      "  Contenido: " + String(item.contenido || ""),
      "  Fuentes: " + (Array.isArray(item.fuentes) ? item.fuentes.join(", ") : "")
    ].join("\n");
  }).join("\n");
}

function coachPipelineFormatExamples(ejemplos) {
  var lista = Array.isArray(ejemplos) ? ejemplos : [];
  if (!lista.length) return "Sin ejemplos de calibracion.";

  return lista.map(function(item) {
    return [
      "- Categoria: " + String(item.categoria || "general"),
      "  Pregunta modelo: " + String(item.pregunta || ""),
      "  Respuesta esperada modelo: " + String(item.respuesta_esperada || "")
    ].join("\n");
  }).join("\n");
}

function coachPipelineExtractRequest(req) {
  if (req && req.provider === "ollama") return coachPipelineCallOllama(req);
  if (req && req.provider === "gemini") return coachPipelineCallGemini(req);

  return {
    choices: [{ message: { content: '{}' } }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

function coachPipelineCallGemini(req) {
  var apiKey = String((req.cfg && req.cfg.geminiApiKey) || "").trim();
  if (!apiKey) {
    throw new Error("Gemini API key no configurada");
  }

  var preferido = String(req.modelo || (req.cfg && req.cfg.geminiModel) || "").trim();
  var candidatos = [preferido].concat(COACH_PIPELINE_EXTRACT_MODELOS_GEMINI_FALLBACK).filter(function(modelo, index, arr) {
    return modelo && arr.indexOf(modelo) === index;
  });

  var ultimoError = null;
  for (var i = 0; i < candidatos.length; i++) {
    try {
      return coachPipelineCallGeminiModel(req, apiKey, candidatos[i]);
    } catch (e) {
      ultimoError = e;
      var msg = String(e);
      if (msg.indexOf("HTTP 404") === -1 && msg.indexOf("HTTP 503") === -1) throw e;
      if (i < candidatos.length - 1) Utilities.sleep(1500);
    }
  }

  throw ultimoError || new Error("Gemini sin modelo disponible");
}

function coachPipelineCallGeminiModel(req, apiKey, modelo) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(modelo) + ":generateContent";

  var body = {
    systemInstruction: {
      parts: [{ text: String(req.promptSistema || COACH_PIPELINE_EXTRACT_PROMPT_MAESTRO) }]
    },
    contents: [{
      role: "user",
      parts: [{ text: String(req.mensajeUsuario || "") }]
    }],
    generationConfig: {
      temperature: Number(req.temperatura || 0.35),
      maxOutputTokens: Math.max(512, Number((req.cfg && req.cfg.maxTokensSalida) || 240) * 3),
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          respuesta_directa: { type: "STRING" },
          estado_dia: { type: "STRING" },
          lectura_rapida: { type: "STRING" },
          accion_ahora: { type: "STRING" },
          siguiente_paso: { type: "STRING" },
          ajuste_creditos: { type: "STRING" },
          micro_habito: { type: "STRING" },
          mensaje_motivador: { type: "STRING" }
        },
        required: ["respuesta_directa"]
      }
    }
  };

  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var status = Number(resp.getResponseCode() || 0);
  var raw = String(resp.getContentText() || "");

  if (status < 200 || status >= 300) {
    throw new Error("Gemini HTTP " + status + " - " + raw.substring(0, 180));
  }

  var data = JSON.parse(raw);
  var parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  var contenido = parts.map(function(p) { return String(p.text || ""); }).join("\n").trim();
  var usage = data.usageMetadata || {};

  return {
    modelo_usado: modelo,
    choices: [{ message: { content: contenido || '{}' } }],
    usage: {
      prompt_tokens: Number(usage.promptTokenCount || 0),
      completion_tokens: Number(usage.candidatesTokenCount || 0),
      total_tokens: Number(usage.totalTokenCount || 0)
    }
  };
}

function coachPipelineCallOllama(req) {
  var url = String((req.cfg && req.cfg.ollamaProxyUrl) || "").trim();
  if (!url) {
    throw new Error("Proxy Ollama no configurado");
  }

  var payloadProxy = {
    app: "nutrafit",
    type: "coach_nutrafit",
    provider: "ollama",
    model: String(req.modelo || ""),
    route: String(req.rutaRespuesta || "coaching"),
    mode: String(req.modo || "auto"),
    event: String(req.evento || "pregunta_libre"),
    user_id: String(req.usuarioId || "").trim().toLowerCase(),
    question: String(req.pregunta || ""),
    temperature: Number(req.temperatura || 0.35),
    max_tokens: Number((req.cfg && req.cfg.maxTokensSalida) || 240),
    timeout_ms: Number((req.cfg && req.cfg.timeoutMs) || 12000),
    system_prompt: String(req.promptSistema || COACH_PIPELINE_EXTRACT_PROMPT_MAESTRO),
    user_prompt: String(req.mensajeUsuario || ""),
    profile: req.contextoUsuario || {},
    context: req.contextoFinal || {}
  };

  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payloadProxy),
    muteHttpExceptions: true
  });

  var status = Number(resp.getResponseCode() || 0);
  var raw = String(resp.getContentText() || "");

  if (status < 200 || status >= 300) {
    throw new Error("Proxy Ollama HTTP " + status + " - " + raw.substring(0, 180));
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    return {
      choices: [{ message: { content: raw } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }
}

function coachPipelineExtractGetText(respuestaProveedor) {
  var r = respuestaProveedor || {};

  if (r.response_json && typeof r.response_json === "object") {
    return JSON.stringify(r.response_json);
  }

  if (r.respuesta && typeof r.respuesta === "object") {
    return JSON.stringify(r.respuesta);
  }

  if (r.output_json && typeof r.output_json === "object") {
    return JSON.stringify(r.output_json);
  }

  if (typeof r.response_text === "string" && r.response_text.trim()) {
    return r.response_text.trim();
  }

  if (typeof r.content === "string" && r.content.trim()) {
    return r.content.trim();
  }

  if (r.message && typeof r.message.content === "string") {
    return String(r.message.content || "").trim();
  }

  if (Array.isArray(r.choices) && r.choices[0] && r.choices[0].message) {
    return String(r.choices[0].message.content || "").trim();
  }

  return "";
}

function coachPipelineExtractUsage(respuestaProveedor) {
  var r = respuestaProveedor || {};
  var usage = (r.usage && typeof r.usage === "object") ? r.usage : {};
  return {
    prompt_tokens: Number(usage.prompt_tokens || usage.prompt_eval_count || usage.input_tokens || 0),
    completion_tokens: Number(usage.completion_tokens || usage.completion_tokens || usage.output_tokens || 0),
    total_tokens: Number(usage.total_tokens || usage.total || 0)
  };
}

function coachPipelineExtractParseJson(contenido) {
  var raw = String(contenido || "").trim();
  if (!raw) return {};

  if (raw.indexOf("```") >= 0) {
    raw = raw.replace(/```json|```/gi, "").trim();
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    try {
      var match = raw.match(/\{[\s\S]*\}/);
      if (match && match[0]) return JSON.parse(match[0]);
    } catch (e2) {
      return {};
    }
    return {};
  }
}

function coachPipelineExtractNormalizeFallback(pregunta, evento, contexto, contenido, modo) {
  var preguntaTxt = String(pregunta || "").trim();
  var eventoTxt = String(evento || "").trim() || "pregunta_libre";
  var modoTxt = String(modo || "").trim() || "auto";
  var base = {
    respuesta_directa: preguntaTxt ? "Para avanzar hoy, toma una accion concreta y pequeña: decide una comida sencilla, revisa tus creditos y haz la mejor eleccion posible." : "Hoy da un paso concreto y simple para mantener la constancia.",
    estado_dia: "equilibrado",
    lectura_rapida: "La mejor decision hoy es priorizar una accion pequeña, segura y consistente.",
    accion_ahora: "Elige una comida o bebida de una sola decision y hazla ahora mismo.",
    siguiente_paso: "Revisa tu plan de las proximas horas y ajusta solo lo necesario.",
    ajuste_creditos: "Sin ajuste brusco, prioriza estabilidad.",
    micro_habito: "Haz una accion de 5 a 10 minutos que te ayude a mantener el rumbo.",
    mensaje_motivador: "Sigue con constancia; la mejora viene de decisiones pequeñas y repetidas."
  };

  return {
    respuesta_directa: String(base.respuesta_directa || "").substring(0, 220),
    estado_dia: String(base.estado_dia || "equilibrado"),
    lectura_rapida: String(base.lectura_rapida || ""),
    accion_ahora: String(base.accion_ahora || ""),
    siguiente_paso: String(base.siguiente_paso || ""),
    ajuste_creditos: String(base.ajuste_creditos || "Sin ajuste brusco."),
    micro_habito: String(base.micro_habito || ""),
    mensaje_motivador: String(base.mensaje_motivador || "")
  };
}

function coachPipelineExtractApplyGuards(respuesta, pregunta) {
  var out = respuesta || {};
  var cleaned = {
    respuesta_directa: String(out.respuesta_directa || "").trim() || "Te recomiendo una decision simple y concreta para hoy.",
    estado_dia: String(out.estado_dia || "equilibrado").trim() || "equilibrado",
    lectura_rapida: String(out.lectura_rapida || "").trim() || "Mantener la constancia hoy es mejor que intentar compensar todo de golpe.",
    accion_ahora: String(out.accion_ahora || "").trim() || "Haz una accion sencilla en los proximos 10 minutos.",
    siguiente_paso: String(out.siguiente_paso || "").trim() || "Revisa tu plan para las siguientes horas.",
    ajuste_creditos: String(out.ajuste_creditos || "").trim() || "Ajusta con criterio, sin cambios bruscos.",
    micro_habito: String(out.micro_habito || "").trim() || "Haz una decision pequena y medible.",
    mensaje_motivador: String(out.mensaje_motivador || "").trim() || "Sigue con constancia; los buenos habitos se sostienen en lo pequeno."
  };
  return cleaned;
}

function coachPipelineExtractProcess(payload) {
  var p = payload && typeof payload === "object" ? payload : {};
  var usuarioId = String(p.usuario_id || p.usuarioId || "").trim().toLowerCase();
  var evento = String(p.evento || "pregunta_libre").trim();
  var modo = String(p.modo || "auto").toLowerCase() === "chat" ? "chat" : "auto";
  var pregunta = String(p.pregunta || "").trim();
  var contexto = p.contexto && typeof p.contexto === "object" ? p.contexto : {};
  var cfg = coachPipelineExtractConfig();
  var rutaRespuesta = coachPipelineExtractClassifyRoute(pregunta, evento, modo, String(p.intencion || contexto.intencion_detectada || "general"));
  var modelo = coachPipelineExtractChooseModel(evento, p, cfg, rutaRespuesta, modo);
  var providerActivo = coachPipelineExtractResolveProvider(cfg, usuarioId, false, p);

  var contextoFinal = Object.assign({}, contexto, {
    perfil_usuario: contexto.perfil_usuario || {},
    resumen_usuario_nutrafit: contexto.resumen_usuario_nutrafit || "",
    base_oficial_coach: Array.isArray(contexto.base_oficial_coach) ? contexto.base_oficial_coach : COACH_PIPELINE_EXTRACT_BASE_OFICIAL,
    ejemplos_calibracion: Array.isArray(contexto.ejemplos_calibracion) ? contexto.ejemplos_calibracion : COACH_PIPELINE_EXTRACT_EJEMPLOS,
    intencion_detectada: String(p.intencion || contexto.intencion_detectada || "general"),
    ruta_respuesta: rutaRespuesta
  });

  var mensajeUsuario = coachPipelineExtractBuildPrompt(pregunta, evento, contextoFinal, rutaRespuesta, modo);
  var promptSistema = rutaRespuesta === "factual" ? COACH_PIPELINE_EXTRACT_PROMPT_FACTUAL : COACH_PIPELINE_EXTRACT_PROMPT_MAESTRO;
  var tempOverride = rutaRespuesta === "factual" ? 0.25 : 0.35;

  try {
    var respuestaProveedor = coachPipelineExtractRequest({
      provider: providerActivo,
      cfg: cfg,
      usuarioId: usuarioId,
      evento: evento,
      modo: modo,
      pregunta: pregunta,
      rutaRespuesta: rutaRespuesta,
      modelo: modelo,
      promptSistema: promptSistema,
      mensajeUsuario: mensajeUsuario,
      temperatura: tempOverride,
      contextoFinal: contextoFinal,
      contextoUsuario: contexto.perfil_usuario || {}
    });

    var contenido = String(coachPipelineExtractGetText(respuestaProveedor) || "{}").trim();
    var respuesta = coachPipelineExtractParseJson(contenido);
    var salidaModeloValida = Boolean(respuesta && String(respuesta.respuesta_directa || "").trim());
    var salida = salidaModeloValida ? coachPipelineExtractApplyGuards(respuesta, pregunta) : coachPipelineExtractNormalizeFallback(pregunta, evento, contextoFinal, contenido, modo);

    return {
      ok: true,
      status: "ok",
      provider: providerActivo,
      model: modelo,
      respuesta: salida,
      debug_route: {
        provider_activo: providerActivo,
        ruta_respuesta: rutaRespuesta,
        modelo: modelo,
        fuente_salida: salidaModeloValida ? "modelo" : "fallback"
      },
      usage: coachPipelineExtractUsage(respuestaProveedor)
    };
  } catch (error) {
    Logger.log("coachPipelineExtractProcess error: " + String(error));
    return {
      ok: true,
      status: "ok",
      provider: providerActivo,
      model: modelo,
      respuesta: coachPipelineExtractNormalizeFallback(pregunta, evento, contextoFinal, "", modo),
      warning: "fallback",
      debug_route: {
        provider_activo: providerActivo,
        ruta_respuesta: rutaRespuesta,
        modelo: modelo,
        fuente_salida: "fallback"
      },
      error: String(error)
    };
  }
}

function coachPipelineExtractStatus() {
  var cfg = coachPipelineExtractConfig();
  return {
    version: COACH_PIPELINE_EXTRACT_VERSION,
    provider: cfg.provider,
    model_primary: cfg.modelPrimary,
    model_factual: cfg.modelFactual,
    model_summary: cfg.modelSummary,
    gemini_configured: Boolean(cfg.geminiApiKey),
    proxy_configured: Boolean(cfg.ollamaProxyUrl),
    canary_users: cfg.canaryUsers
  };
}
