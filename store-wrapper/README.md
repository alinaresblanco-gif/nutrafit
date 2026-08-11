# Nutrafit Store Wrapper

Este wrapper empaqueta la PWA de Nutrafit (carpeta docs) como app nativa para Store.

## Requisitos
- Node.js y npm
- Android Studio para Android
- Xcode (solo en Mac) para iOS

## Flujo rapido Android
1. npm install
2. npm run add:android
3. npm run sync:web
4. npm run open:android

En Android Studio:
- Ajustar firma de release.
- Generar AAB (Build > Generate Signed Bundle / APK).
- Subir AAB a Google Play Console.

## Flujo iOS (en Mac)
1. npm install
2. npm run add:ios
3. npm run sync:web
4. npm run open:ios

En Xcode:
- Configurar Team y Signing.
- Archive.
- Distribute App a App Store Connect.

## Notas
- La app web que se empaqueta sale de ../docs.
- Si cambias archivos web, vuelve a ejecutar npm run sync:web.
- El backend API sigue configurado en index.html.
