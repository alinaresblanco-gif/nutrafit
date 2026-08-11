# NutraFit - Guia de implantacion de Ollama para Coach IA

Fecha: 2026-08-11
Estado: Plan maestro de ejecucion
Objetivo: Incorporar IA notable en NutraFit sin romper la app estable ni el APK ya distribuido.

---

## 1) Vision y regla principal

Queremos un coach nutricional y deportivo:
- Util en decisiones del dia a dia.
- Consistente en tono y formato.
- Seguro (sin consejos medicos de riesgo).
- Medible (calidad, latencia, fallos).

Regla principal:
- La app nunca depende de una unica llamada IA para funcionar.
- Si IA falla, siempre hay fallback controlado.

---

## 2) Donde va Ollama (arquitectura correcta)

No se instala dentro del APK.
Se ejecuta en servidor dedicado.

Flujo recomendado:
1. App NutraFit (PWA/APK)
2. Backend actual (Apps Script)
3. Servicio IA intermedio (proxy propio)
4. Ollama (modelo local en servidor)

Por que usar proxy intermedio:
- Seguridad de red y claves.
- Reintentos, timeouts y logs.
- Control de versiones de prompts.
- Cambio de modelo sin tocar la app.

Capas recomendadas dentro del proxy:
- Normalizador de salida JSON (obligatorio).
- Filtro de seguridad medica (obligatorio).
- Selector de modelo por ruta (coaching/factual/resumen).
- Memoria de usuario solo por contexto entrante (sin estado interno en Ollama).

---

## 3) Fases de implantacion sin romper nada

## Fase 0 - Congelar baseline (obligatorio)

Checklist:
- Confirmar version estable actual de frontend y backend.
- Ejecutar mini test y bateria actual del coach.
- Guardar resultados base:
  - porcentaje de aprobacion
  - latencia media
  - tasa de fallback
- Definir criterio de exito minimo de la nueva IA.

Criterio sugerido:
- Mini test >= 90%
- Bateria 30 preguntas >= 85%
- Latencia p95 <= 7 s en modo chat
- Fallos tecnicos <= 2%

---

## Fase 1 - Infraestructura Ollama

Objetivo:
- Tener un endpoint estable y monitorizable.

Pasos:
1. Preparar servidor (Linux recomendado).
2. Instalar Docker y levantar Ollama en contenedor.
3. Probar endpoint local de salud.
4. Descargar 1 modelo base para coach.

Modelo sugerido de arranque:
- Gemma/Qwen/Llama de 8B para equilibrio calidad-latencia.
- Mantener opcion de modelo mayor para tareas puntuales.

Politica de disponibilidad:
- Timeout estricto por request.
- Reintento maximo 1 vez.
- Si falla, responder fallback desde backend.

---

## Fase 2 - Proxy IA (capa de control)

Objetivo:
- No conectar Apps Script directo a Ollama sin control.

Responsabilidades del proxy:
- Recibir contexto del coach desde Apps Script.
- Construir prompt final con plantilla versionada.
- Llamar a Ollama chat endpoint.
- Validar JSON de salida.
- Loggear metricas.
- Aplicar fallback si JSON invalido o timeout.

Contrato de entrada (ejemplo):
- usuario_id
- evento
- modo (auto/chat)
- pregunta
- contexto (creditos, agua, ejercicio, vista, objetivo)
- ruta_respuesta (coaching/factual)

Contrato de salida (debe mantenerse estable):
- respuesta_directa
- estado_dia
- lectura_rapida
- accion_ahora
- siguiente_paso
- ajuste_creditos
- micro_habito
- mensaje_motivador

---

## Fase 3 - Integracion en Apps Script por flag

Objetivo:
- Activar sin tocar UX ni romper flujo actual.

Nuevas Script Properties recomendadas:
- NUTRAFIT_COACH_PROVIDER = offline | ollama
- NUTRAFIT_COACH_OLLAMA_PROXY_URL
- NUTRAFIT_COACH_OLLAMA_MODEL_PRIMARY
- NUTRAFIT_COACH_OLLAMA_MODEL_FACTUAL
- NUTRAFIT_COACH_OLLAMA_MODEL_SUMMARY
- NUTRAFIT_COACH_TIMEOUT_MS
- NUTRAFIT_COACH_CANARY_USERS (lista de usuarios piloto)

Reglas:
1. Si provider = offline -> respuesta actual de construccion/fallback.
2. Si provider = ollama y usuario no esta en canary -> offline/fallback.
3. Si provider = ollama y usuario canary -> proxy -> Ollama.
4. Si cualquier error -> fallback + log tecnico.

---

## Fase 4 - Prompts maestros (base de calidad)

Nota importante:
- No vamos a "entrenar" pesos al inicio.
- Primero hacemos "educacion por sistema": prompt + contexto + ejemplos + evaluacion.

### 4.1 Prompt sistema maestro (coaching)

Objetivo:
- Respuestas accionables, concretas y breves.

Plantilla recomendada:

Rol:
Eres Coach NutraFit de nutricion y actividad fisica. Tu objetivo es ayudar a la usuaria a tomar la siguiente mejor decision hoy.

Reglas:
- Responde siempre en espanol claro.
- Usa un tono cercano, sin sermones.
- Prioriza accion inmediata y realista.
- No inventes datos nutricionales exactos si no hay evidencia en contexto.
- No des diagnosticos ni tratamientos medicos.
- Si la consulta es medica, indica limite y recomienda consulta profesional.
- Adapta recomendaciones a creditos disponibles, agua, ejercicio y objetivo.

Formato obligatorio:
Devuelve SOLO un JSON valido con estas claves:
- respuesta_directa
- estado_dia
- lectura_rapida
- accion_ahora
- siguiente_paso
- ajuste_creditos
- micro_habito
- mensaje_motivador

Restricciones de calidad:
- respuesta_directa: maximo 90 palabras.
- accion_ahora: una accion ejecutable en menos de 10 minutos.
- siguiente_paso: accion para las proximas 3-6 horas.
- mensaje_motivador: breve y sin frases vacias.

Reglas extra de seguridad:
- Si falta contexto para calculo personalizado, pedir solo el dato minimo faltante.
- Si hay contenido medico sensible, bloquear indicaciones clinicas y devolver limite seguro.
- Nunca devolver enlaces o bloques de "fuentes consultadas" en la respuesta final al usuario.

### 4.2 Prompt factual (nutricion/deporte)

Objetivo:
- Contestar preguntas de hechos sin estilo plantilla de coaching largo.

Plantilla recomendada:

Rol:
Eres asistente factual de NutraFit.

Reglas:
- Responde de forma directa y util.
- Si falta precision de alimento/cantidad, da rango prudente y pide dato minimo para afinar.
- Prioriza base oficial interna cuando exista.
- No bloquear con "no tengo evidencia" si puedes dar orientacion general segura.

Formato:
- Mantener mismo JSON obligatorio del coach para compatibilidad.
- Poner foco principal en respuesta_directa.

### 4.3 Ejemplos de calibracion

Recomendacion:
- Mantener 20-50 ejemplos reales de alta calidad.
- Clasificar por intencion: plan_hoy, antojos, hidratacion, ejercicio, comer_fuera, factual_alimentos.
- En cada ejemplo guardar:
  - contexto de entrada
  - salida ideal
  - por que esa salida fue buena

Minimo operativo recomendado por dominios:
- 20 ejemplos coaching general.
- 20 ejemplos factual nutricion/deporte.
- 10 ejemplos despensa.
- 10 ejemplos creditos diarios.
- 10 ejemplos deporte/recuperacion.

---

## Fase 5 - Educar al coach de forma iterativa

La "educacion" correcta para fase 1 es:
1. Curar ejemplos de calidad.
2. Evaluar automaticamente.
3. Corregir prompt y reglas.
4. Repetir.

Ciclo semanal sugerido:
1. Revisar preguntas reales de usuarios piloto.
2. Detectar 10 peores respuestas.
3. Convertirlas en casos de test.
4. Ajustar prompt o reglas de normalizacion.
5. Reejecutar mini test + bateria.
6. Publicar nueva version de prompt (vX.Y).

Versionado de prompts:
- prompt_coach_v1_0
- prompt_coach_v1_1
- prompt_factual_v1_0

Nunca cambiar prompt en produccion sin:
- test automatico
- nota de cambios
- rollback listo

Matriz minima de tests previos a release:
- 20 tests de coaching
- 20 tests de factual
- 10 tests de despensa
- 10 tests de creditos
- 10 tests de deporte

---

## Fase 6 - Evaluacion y metricas obligatorias

Metricas minimas por entorno (piloto/prod):
- tasa_json_valido
- tasa_fallback
- latencia_p50
- latencia_p95
- aprobacion_mini_test
- aprobacion_bateria_30
- consultas_medicas_detectadas

Alarmas sugeridas:
- fallback > 10% en 15 min
- p95 > 10 s sostenido
- json_valido < 95%

KPI de seguridad:
- indicaciones medicas peligrosas detectadas = 0
- consultas medicas con limite correcto >= 98%

---

## Fase 7 - Canary release (despliegue controlado)

Plan:
1. 5 usuarios internos durante 3 dias.
2. 20 usuarios beta durante 7 dias.
3. 50% usuarios durante 7 dias.
4. 100% solo si KPI en verde.

Regla de rollback inmediato:
- Si sube fallback o baja aprobacion por debajo del umbral.

Rollback tambien si:
- aumenta la tasa de JSON invalido
- aparece cualquier salida medica no permitida

---

## 4) Como evitar repetir el problema de Groq

Errores a evitar:
- Cambiar proveedor sin capa de compatibilidad.
- No medir calidad antes de abrir a todos.
- Depender de un unico modelo sin fallback.
- Cambiar prompt sin versionado.

Contramedidas:
- Proxy intermedio obligatorio.
- JSON estricto y validador.
- Flags por usuario.
- Canary y rollback.
- Test automatizados en cada cambio.

---

## 5) Actualizacion de APK: cuando si y cuando no

No hace falta nuevo APK si:
- Solo cambias backend/proxy/modelo/prompt.

Si hace falta nuevo APK si:
- Cambias UI cliente.
- Cambias comportamiento local de la app.
- Cambias permisos o configuracion nativa.

---

## 6) Checklist operativo de implantacion

Pre-produccion:
- Infra Ollama estable.
- Proxy funcionando.
- Timeout y fallback probados.
- Prompts v1 versionados.
- Mini test + bateria superados.

Produccion piloto:
- Canary habilitado.
- Dashboard de metricas activo.
- Registro de errores tecnico y funcional.

Escalado:
- Revisiones semanales de calidad.
- Nuevos casos de test desde conversaciones reales.
- Ajuste de prompt con control de cambios.

---

## 7) Plan de trabajo sugerido (10 dias)

Dia 1:
- Baseline de calidad actual + objetivos.

Dia 2-3:
- Infra Ollama + proxy.

Dia 4:
- Integracion por flag en Apps Script.

Dia 5:
- Prompt v1 coaching + factual.

Dia 6:
- Validacion tecnica (JSON, latencia, fallback).

Dia 7:
- Mini test + bateria 30.

Dia 8-9:
- Canary interno y correcciones.

Dia 10:
- Decision de ampliar piloto.

---

## 8) Plantilla de decision GO / NO GO

GO si:
- Calidad supera umbral definido.
- Latencia aceptable.
- Sin regresiones funcionales.
- Rollback validado.

NO GO si:
- JSON inestable.
- Fallback alto.
- Respuestas poco accionables.
- Riesgos de seguridad o cumplimiento.

---

## 9) Siguiente paso inmediato para NutraFit

1. Implementar Fase 0 esta semana.
2. Levantar proxy + Ollama en entorno de pruebas.
3. Definir Prompt v1 con 20 ejemplos de calibracion.
4. Activar canary interno por Script Property.

Estado de implantacion inicial ya realizado:
- Backend preparado para provider por flag y canary.
- Seleccion de modelo por ruta (primary/factual/resumen).
- Integracion de llamada a proxy Ollama (si provider/canary activos).
- Normalizador de salida endurecido (esquema fijo, recortes y guardas medicas).

Con este metodo construimos un coach fuerte, medible y seguro, sin romper la base actual de NutraFit.
