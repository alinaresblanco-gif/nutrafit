# NutraFit Coach Proxy (Ollama)

Proxy intermedio para conectar Apps Script con Ollama sin exponer complejidad al frontend.

## 1) Requisitos

- Node.js 18+
- Ollama instalado y ejecutandose
- Modelo descargado en Ollama

Ejemplo:

```powershell
ollama pull llama3.1:8b
ollama pull phi3:mini
```

## 2) Configuracion rapida

1. Copia .env.example a .env
2. Ajusta valores si hace falta
3. Ejecuta:

```powershell
npm start
```

## 2.1) Crear modelo profesional NUTRACOACH (recomendado)

En esta carpeta ya tienes un `Modelfile` listo.

1. Crea el modelo local:

```powershell
ollama create nutracoach -f Modelfile
```

2. Verifica que existe:

```powershell
ollama list
```

3. (Opcional) Fuerza el proxy a usarlo en todas las rutas con `.env`:

```env
COACH_PRIMARY_MODEL=nutracoach
COACH_FACTUAL_MODEL=nutracoach
COACH_SUMMARY_MODEL=nutracoach
```

Por defecto escucha en:

- http://localhost:8787/health
- http://localhost:8787/coach

## 3) Health check

```powershell
curl http://localhost:8787/health
```

## 4) Test manual del endpoint coach

```powershell
curl -X POST http://localhost:8787/coach -H "Content-Type: application/json" -d "{\"route\":\"coaching\",\"mode\":\"chat\",\"event\":\"pregunta_libre\",\"question\":\"Tengo antojo de dulce, que hago?\",\"profile\":{\"objetivo\":\"perder grasa\",\"creditos_disponibles\":5},\"context\":{\"vista_actual\":\"diario-formulario\"}}"
```

Respuesta esperada:

- status: ok
- response_json con las 8 claves del esquema NutraFit

## 4.1) Tests automaticos (7 checks)

Ejecuta:

```powershell
npm run test:coach
```

El script valida:

- JSON valido y esquema completo
- limite medico
- accion inmediata y siguiente paso
- comportamiento factual
- uso de despensa
- coherencia con creditos
- mensaje motivador breve

## 5) Integracion con Apps Script

En Script Properties:

- NUTRAFIT_COACH_PROVIDER = ollama
- NUTRAFIT_COACH_OLLAMA_PROXY_URL = https://TU_PROXY_PUBLICO/coach
- NUTRAFIT_COACH_OLLAMA_MODEL_PRIMARY = llama3.1:8b
- NUTRAFIT_COACH_OLLAMA_MODEL_FACTUAL = phi3:mini
- NUTRAFIT_COACH_OLLAMA_MODEL_SUMMARY = phi3:mini
- NUTRAFIT_COACH_TIMEOUT_MS = 12000
- NUTRAFIT_COACH_CANARY_USERS = email1@dominio.com,email2@dominio.com

Nota importante:

- Apps Script corre en Google Cloud. No puede llamar a localhost de tu PC.
- Para pruebas reales desde la app, el proxy debe estar publicado con URL HTTPS accesible desde internet.

## 6) Seguridad

- El proxy aplica normalizacion de salida y filtro medico basico.
- No guarda estado en Ollama.
- El contexto de usuario se envia en cada solicitud.
