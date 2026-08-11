# NutraFit - Guia de prueba E2E del Coach con Ollama

Fecha: 2026-08-11
Objetivo: Probar de extremo a extremo el coach desde el boton de la app hasta respuesta IA real.

## 1) Lo que ya esta implantado

- Boton ON/OFF funcional en panel del coach.
- Input de chat y envio con Enter o boton enviar.
- Frontend conectado a tipo=coach_nutrafit en Apps Script.
- Backend con provider por flag + canary.
- Backend con selector de modelo por ruta: coaching, factual, resumen.
- Backend con normalizador y guardas medicas.
- Proxy local listo en carpeta coach-proxy.

## 2) Arrancar Ollama y proxy

### 2.1 Ollama

En la maquina del proxy:

```powershell
ollama serve
ollama pull llama3.1:8b
ollama pull phi3:mini
```

### 2.2 Proxy

En carpeta coach-proxy:

```powershell
npm start
```

Comprobar salud:

```powershell
curl http://localhost:8787/health
```

## 3) Publicar proxy para que Apps Script lo alcance

Importante:
- Apps Script no puede llamar a localhost.
- Necesitas una URL HTTPS publica para /coach.

Opciones:
- VPS con dominio y TLS
- Cloud Run / Render / Railway
- Tunel temporal (solo pruebas)

URL final ejemplo:
- https://tu-proxy-dominio/coach

## 4) Configurar Script Properties en Apps Script

En el proyecto desplegado de Apps Script, define:

- NUTRAFIT_COACH_ENABLED = true
- NUTRAFIT_COACH_PROVIDER = ollama
- NUTRAFIT_COACH_OLLAMA_PROXY_URL = https://tu-proxy-dominio/coach
- NUTRAFIT_COACH_OLLAMA_MODEL_PRIMARY = llama3.1:8b
- NUTRAFIT_COACH_OLLAMA_MODEL_FACTUAL = phi3:mini
- NUTRAFIT_COACH_OLLAMA_MODEL_SUMMARY = phi3:mini
- NUTRAFIT_COACH_TIMEOUT_MS = 12000
- NUTRAFIT_COACH_CANARY_USERS = tu_email@dominio.com

Luego:
- Hacer nuevo despliegue o actualizar despliegue.
- Verificar que la app usa la URL /exec correcta del despliegue activo.

## 5) Prueba funcional en la app (boton coach)

1. Abrir la app con usuario canary.
2. Entrar a una vista cualquiera para que se inicialice el coach.
3. Pulsar boton del coach (imagen).
4. Pulsar ON en el panel.
5. Enviar una pregunta de chat.

Preguntas recomendadas:

- Coaching:
  - Tengo ansiedad por dulce ahora, que hago en 10 minutos?
- Factual:
  - Cuanta proteina tienen 100 g de garbanzos cocidos?
- Resumen:
  - Cierra mi dia con un resumen rapido y el siguiente paso.

Resultado esperado:
- Mensaje Pensando...
- Respuesta del coach en formato natural para usuario
- Tarjeta de inicio y tarjeta de vista actualizadas

## 6) Prueba tecnica minima

### 6.1 Mini test

Lanzar tipo=ejecutar_mini_test_coach con usuario y dispositivo validos.

Esperado:
- status=ok
- porcentaje_aprobado visible

### 6.2 Validar logs

En hoja coach_uso:
- Se registran modelo@provider
- Tokens
- Evento y pregunta

## 7) Si no responde

Checklist rapido:
1. Usuario en canary?
2. NUTRAFIT_COACH_PROVIDER=ollama?
3. URL del proxy publica y responde /coach?
4. Ollama activo y modelos descargados?
5. Despliegue Apps Script actualizado?

## 8) Criterio para abrir a mas usuarios

- json_valido >= 95%
- fallback <= 10%
- p95 <= 10 s
- mini test >= 90%
- bateria 30 >= 85%

## 9) Nota de seguridad

- No abrir al 100% hasta pasar canary.
- Si aparecen respuestas medicas peligrosas, rollback inmediato a provider=offline.
