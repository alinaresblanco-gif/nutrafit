# Nutrafit - Checklist Publicacion Store

## 1. URL de instalacion web validada
- URL PWA activa: https://alinaresblanco-gif.github.io/nutrafit/
- Backend API activo en index: Apps Script /exec

## 2. Preparar wrapper nativo
- Ir a la carpeta store-wrapper.
- Instalar dependencias: npm install
- Sincronizar web en wrapper: npm run sync:web
- Crear Android nativo (si no existe): npm run add:android

## 3. Android - Google Play
- Generar icono final de app (512x512 y adaptativos Android).
- Revisar nombre comercial y package id en capacitor.config.json.
- Abrir proyecto Android Studio: npm run open:android
- Build release AAB.
- Subir AAB a Google Play Console.

## 4. iOS - App Store
- Copiar este mismo wrapper en un Mac.
- Ejecutar npm install y npx cap add ios.
- Abrir en Xcode y firmar con cuenta Apple Developer.
- Crear build y subir a App Store Connect.

## 5. Contenido obligatorio de ficha
- Politica de privacidad publica.
- Correo de soporte.
- Capturas de pantalla por dispositivo.
- Descripcion corta y larga.

## 6. Verificacion final antes de envio
- Login/registro abre correctamente.
- Carga vistas principales.
- Guarda y lee datos desde backend.
- Service Worker sin errores.
