# Diagnostico tecnico del coach NutraFit

Fecha: 2026-08-13
Objetivo: explicar por que pueden salir respuestas sin coherencia y definir un camino de correccion seguro.

## 1) Resumen ejecutivo

El flujo del coach existe y esta completo, pero hay varios puntos que pueden producir salidas incoherentes o poco personalizadas aunque no haya errores tecnicos visibles.

Los tres focos mas probables son:

1. Ruta de proveedor cayendo a offline (sin modelo real) por configuracion de properties y canary.
2. Doble postproceso y reglas de sustitucion que pisan la salida del modelo.
3. Contexto de usuario incompleto para personalizacion real.

## 2) Hallazgos priorizados

### Critico A: Muchas ejecuciones pueden terminar en offline aunque todo parezca bien

Evidencia:
- La configuracion de provider por defecto es offline en Apps Script.
- Ademas, para usar ollama se exige proxy configurado y usuario dentro de canary.

Impacto:
- Si falla cualquiera de esas tres condiciones, no se llama al proxy real.
- El resultado termina en respuesta generica normalizada.

Referencias:
- [resolver de provider en extracto](docs/coach_pipeline_extract.gs.txt#L153)
- [llamada al proxy en extracto](docs/coach_pipeline_extract.gs.txt#L182)

### Critico B: En modo offline se devuelve objeto vacio, no un fallback semantico

Evidencia:
- En solicitarRespuestaCoachProveedor, cuando provider no es ollama, devuelve content con objeto vacio.
- Ese vacio se rellena despues con normalizador y plantillas.

Impacto:
- Sensacion de respuesta robotica o poco conectada a la pregunta.
- Dificulta distinguir si respondio el modelo o solo el fallback.

Referencia:
- [offline devuelve JSON vacio](docs/coach_pipeline_extract.gs.txt#L153)

### Alto C: Doble normalizacion puede desalinear contenido final

Evidencia:
- El proxy ya aplica ensureSchema y limpieza.
- Apps Script vuelve a parsear y normalizar con reglas propias.

Impacto:
- Parte del contenido util del modelo puede recortarse o ser reemplazado por reglas de fallback.
- Aumenta la variabilidad y la sensacion de incoherencia.

Referencias:
- [normalizador en proxy](coach-proxy/server.mjs#L66)
- [normalizador en Apps Script](docs/coach_pipeline_extract.gs.txt#L540)
- [guardas Apps Script](docs/coach_pipeline_extract.gs.txt#L733)

### Alto D: Regla factual puede sobreescribir demasiado la respuesta del modelo

Evidencia:
- En ruta factual existen respuestas canonicas y mini-test que pueden imponerse sobre la salida del modelo.

Impacto:
- Respuesta menos contextualizada al caso real del usuario.
- Puede parecer que repite frases o no responde exactamente a la pregunta.

Referencia:
- [logica factual con overrides](docs/coach_pipeline_extract.gs.txt#L540)

### Medio E: CONTEXTO_JSON no siempre trae datos fuertes de perfil

Evidencia:
- CONTEXTO_JSON se construye bien, pero varios campos dependen de valores que no siempre existen en perfil_usuario (altura, edad, sexo, objetivo detallado).

Impacto:
- El modelo no puede personalizar con precision y cae a recomendaciones generales.

Referencias:
- [constructor CONTEXTO_JSON](docs/coach_pipeline_extract.gs.txt#L319)
- [construccion perfil de usuario](Codigo.gs.txt#L1761)

### Medio F: Clasificacion factual amplia

Evidencia:
- La clasificacion manda muchas consultas a factual por regex e intencion.

Impacto:
- Puede enviar preguntas de coaching practico a un flujo que prioriza respuesta directa y deja otros campos en blanco.

Referencia:
- [clasificacion de ruta](docs/coach_pipeline_extract.gs.txt#L413)

## 3) Señales para confirmar causa en produccion

1. Revisar en respuesta si provider sale como ollama u offline.
2. Revisar model, warning y quota en cada llamada.
3. Medir porcentaje de respuestas con provider offline en una muestra de 20 preguntas.
4. Revisar si respuesta_directa llega vacia desde proxy o se vacia despues en Apps Script.

## 4) Plan de correccion recomendado (sin romper)

### Fase 1 - Observabilidad minima

1. Añadir campo debug_route en la respuesta final con:
- provider_activo
- ruta_respuesta
- modelo
- fuente_salida (proxy o fallback)

2. Guardar en coach_uso dos columnas extra:
- provider_real
- warning_fallback

Resultado esperado:
- visibilidad inmediata de por que una respuesta salio incoherente.

### Fase 2 - Reducir incoherencia por fallback

1. Cambiar offline vacio por fallback semantico real (usar respuesta base util).
2. Mantener esquema pero evitar respuesta_directa demasiado generica.

Resultado esperado:
- mejora inmediata de utilidad cuando no haya ollama.

### Fase 3 - Evitar doble pisado

1. Si el proxy ya devuelve response_json valido, aplicar en Apps Script solo guardas de seguridad minima.
2. Evitar reescrituras agresivas en factual salvo casos medicos o vacio real.

Resultado esperado:
- mayor consistencia entre lo que genera el modelo y lo que recibe el usuario.

### Fase 4 - Mejorar personalizacion real

1. Completar perfil_usuario con edad, sexo, altura y objetivo desde origen fiable.
2. Priorizar creditos y contexto del dia en todas las rutas.

Resultado esperado:
- respuesta mas adaptada al usuario y menos plantillada.

## 5) Riesgos de no aplicar cambios

1. Seguir viendo respuestas correctas en forma, pero flojas en contenido.
2. Dificultad para depurar porque no se distingue facilmente modelo real vs fallback.
3. Baja confianza del usuario final por variabilidad de calidad.

## 6) Orden de trabajo sugerido

1. Instrumentacion de debug (Fase 1).
2. Ajuste offline semantico (Fase 2).
3. Reduccion de doble normalizado (Fase 3).
4. Enriquecimiento de contexto (Fase 4).

Con este orden se gana claridad y calidad rapido, sin reescribir todo el pipeline de una vez.
