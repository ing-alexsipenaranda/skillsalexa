# Lista de lanzamiento de Evoll para Alexa

Esta es la secuencia única para actualizar producción. Conserva el orden: la
Lambda nueva depende de las migraciones y funciones nuevas de LifeOs.

## 1. Preparar y revisar artefactos

Desde una copia limpia de `skillsalexa`, ejecuta:

```bash
npm ci --no-audit --no-fund
scripts/release-preflight.sh
git status --short
```

El preflight debe terminar en `Release preflight passed`. Revisa que Git solo
muestre cambios esperados y conserva `dist/SHA256SUMS` con la evidencia del
lanzamiento. No despliegues archivos `.env`, claves privadas ni credenciales.

## 2. Actualizar LifeOs/Supabase

En el repositorio LifeOs, primero ejecuta el modo de comprobación y después el
despliegue con las credenciales cargadas de forma privada:

```bash
scripts/deploy-alexa-supabase.sh
scripts/deploy-alexa-supabase.sh --apply
```

Esto aplica las migraciones de preferencias y acciones, y publica las funciones
`agent` y `alexa-actions`. Comprueba que ambas funciones responden `401` sin JWT;
una respuesta pública `2xx` sería un bloqueo del lanzamiento.

## 3. Actualizar únicamente el broker del VPS

En `/opt/evoll-alexa` del VPS:

```bash
git pull --ff-only
scripts/update-vps.sh
```

El script respalda SQLite, actualiza solo `linking`, verifica health interno y
externo y restaura la versión anterior si falla. No reinicies Nginx Proxy Manager
ni otros contenedores. Después ejecuta:

```bash
scripts/verify-production.sh
```

Las rutas `/health`, `/privacy` y `/terms` deben responder `200`; los endpoints
privados sin autenticación deben responder `401`.

## 4. Actualizar Alexa Developer Console

1. Importa `dist/evoll-alexa-hosted.zip` en **Code → Import Code** y despliega.
2. Para cada idioma habilitado, importa el JSON correspondiente de
   `dist/skill-package/interactionModels/custom/` y pulsa **Build Model**.
3. Confirma `asistente evol` en español y `evoll assistant` en inglés.
4. Mantén Account Linking con Authorization Code, HTTP Basic y las tres redirect
   URL exactas de Amazon.

## 5. Prueba de aceptación

Con una cuenta de prueba sin datos sensibles:

- vincula, abre, consulta tareas y gastos y solicita más detalles;
- crea una tarea y un recordatorio, confirma y verifica que no se dupliquen;
- desactiva finanzas y acciones en Evoll y confirma que Alexa las bloquee;
- activa modo privado y confirma que no pronuncie ni muestre finanzas;
- desvincula desde Evoll y confirma que Alexa pida vincular otra vez;
- repite apertura, ayuda y una consulta en español e inglés;
- valida en un Echo físico y en el simulador.

Registra duración, resultado y commit desplegado, sin copiar preguntas, tokens,
correos ni identificadores de usuario.

## 6. Decisión y reversión

Publica o solicita certificación solo si todas las pruebas pasan. Si falla el
broker, `scripts/update-vps.sh` revierte automáticamente. Si falla Alexa, vuelve
a importar el ZIP del lanzamiento anterior. Ante exposición de credenciales,
sigue `docs/incident-response.md` antes de reanudar pruebas.
