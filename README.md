# Evoll para Alexa

Skill personal en español para consultar el agente existente de Evoll/LifeOs.
No requiere una versión web de la app móvil ni cambios en LifeOs.

**Estado:** implementación y pruebas locales completas; sin despliegue en Amazon,
sin vinculación real y sin pruebas en un Echo. La llamada real sin autenticación
al agente respondió 401 el 20 de octubre de 2026, confirmando conectividad y
protección de acceso, no una consulta autenticada.

## Qué hace

Ejemplo: **«Alexa, abre mi evol»**, después **«pregunta cuánto gasté este mes»**.
El modelo también admite «Alexa, pregunta a mi evol cuáles son mis tareas»
según cómo Alexa reconozca la invocación. El nombre de invocación configurado
es **mi evol** (es-ES y es-MX); su aceptación y reconocimiento se deben verificar
al compilar el modelo en Amazon.

Reutiliza las capacidades del agente de LifeOs: gastos/ingresos, presupuestos,
movimientos, metas, deudas, tareas, próximos compromisos, notas y vestuario.
No promete acceso a módulos que el agente no ofrece.

Las propuestas de cambios devueltas en `actions` NO se ejecutan ni guardan.
La skill pide volver a solicitarlas en la app, porque las propuestas de esta
consulta no se sincronizan automáticamente con el móvil. El agente existente
sí puede escribir/borrar su memoria mediante sus herramientas: esta integración
no establece una frontera de solo lectura sobre el backend. Respeta el RLS y
los permisos del usuario; no usa `service_role`.

## Arquitectura

```text
Echo → Alexa → Lambda (src/index.js) → Edge Function agent → datos del usuario
                    ↑ JWT de Supabase
App Alexa → puente OAuth → inicio de sesión directo en Supabase
```

El puente ofrece OAuth authorization code compatible con account linking de
Alexa. No depende de habilitar el servidor OAuth 2.1 de Supabase ni de que Alexa
soporte PKCE. La contraseña va desde el navegador directamente a Supabase.
Con consentimiento explícito, el puente recibe el refresh token y mantiene los
tokens cifrados con AES-256-GCM en SQLite; Alexa recibe el access token del usuario
y un refresh token opaco del puente. Las URLs de retorno se comparan exactamente
con las registradas, los códigos son de un solo uso y caducan en 60 segundos,
y el consentimiento está protegido con cookie segura y CSRF.

## Desarrollo y pruebas

Se probó con Node **24.19.0**, npm **11.9.0** y Python 3.12 (solo empaquetado).
El puente requiere Node 24 por `node:sqlite`; la Lambda se genera para Node 22+.

```bash
cd /workspace/skillsalexa
npm --cache /workspace/.npm-cache ci --no-audit --no-fund
npm test
npm run package
```

`npm test` genera el código distribuible y ejecuta pruebas del SDK, errores,
caducidad, renovación, CSRF, permisos por usuario y el flujo de login del bundle
de navegador con Supabase simulado. También ejecuta la Lambda generada.
Estos tests no sustituyen una prueba con una cuenta y un dispositivo reales.

Artefactos:

- `dist/evoll-lambda.zip`: handler autónomo `index.handler`, sin instalar deps en Lambda.
- `dist/evoll-alexa-hosted.zip`: importación directa para **Alexa-hosted (Node.js)**;
  contiene la carpeta `lambda/` exigida por la consola y no incluye secretos.
  Una copia versionada para descargar desde GitHub queda en
  `downloads/evoll-alexa-hosted.zip`.
- `dist/evoll-linking.tar.gz`: puente y página de login, sin credenciales.
- `dist/evoll-docker.tar.gz`: contexto Docker completo para el VPS, sin credenciales.
- `dist/skill-package/interactionModels/custom/{es-ES,es-MX}.json`: modelos para Amazon.

## Despliegue: lo que falta configurar una vez

### 1. Crear la skill y el endpoint en Amazon

En https://developer.amazon.com/alexa/console/ask entra con la cuenta del Echo.
Crea una skill **Custom**, idioma español que corresponda al dispositivo,
con backend propio. Importa el JSON del idioma desde **Interaction Model → JSON
Editor**, guarda y compila. Copia el **Skill ID**.

En AWS crea una Lambda Node.js 22 o 24 en una región compatible con la consola
Alexa. Sube `dist/evoll-lambda.zip`, handler **index.handler**, timeout **8 segundos**.
Configura:

| Variable de Lambda | Valor |
| --- | --- |
| `ALEXA_SKILL_ID` | ID real de la skill (obligatorio) |
| `SUPABASE_URL` | `https://melhdrdiesgeotzhkazg.supabase.co` |
| `AGENT_PROVIDER` | Opcional: `openai` o `anthropic`; omitir conserva el default de Evoll |

Añade el disparador **Alexa Skills Kit**, restringido al Skill ID, y configura
el ARN en **Endpoint** de la skill. No expongas el handler con una Function URL
pública: el trigger de ASK valida el origen y el SDK verifica el Skill ID.
La skill limita la petición a Evoll a 5,5 segundos para poder responder dentro
del plazo de Alexa. Si el agente tarda más, responde con un error recuperable;
la latencia real todavía necesita medición.

### 2. Alojar el puente de vinculación

Necesita un servicio **Node 24**, HTTPS público mediante un proxy TLS y un volumen
persistente privado. No debe usar almacenamiento efímero ni varias réplicas con
bases SQLite diferentes. Puede alojarse donde ya tengas infraestructura; no
se ha contratado ni creado ningún recurso de pago.

Descomprime `dist/evoll-linking.tar.gz` en el servidor, ejecuta
`npm ci --omit=dev` y configura las variables de `broker/.env.example` en el
administrador de secretos del alojamiento. No pongas credenciales en Git.

| Variable del puente | Uso |
| --- | --- |
| `BROKER_ORIGIN` | Origen HTTPS real, sin ruta, por ejemplo `https://vincular.tudominio.com` |
| `SUPABASE_URL` | `https://melhdrdiesgeotzhkazg.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Clave pública publishable/anon del proyecto; nunca secret/service_role |
| `OAUTH_CLIENT_ID` | `evoll-alexa` |
| `OAUTH_CLIENT_SECRET` | Secreto aleatorio de al menos 32 caracteres, generado y guardado de forma segura |
| `TOKEN_ENCRYPTION_KEY` | 32 bytes aleatorios codificados en base64; conservar estable y proteger junto con backups |
| `ALEXA_REDIRECT_URIS` | URLs de retorno EXACTAS que muestra Amazon, separadas por comas |
| `BROKER_DB` | Ruta absoluta en volumen persistente, por ejemplo `/data/evoll-alexa.sqlite` |
| `BIND_HOST` | `127.0.0.1` si el proxy está en la misma máquina; ajustar según el alojamiento |
| `PORT` | `3000` por defecto |

Genera los secretos en el administrador de secretos o en un terminal privado;
no los pegues en este chat. El proceso necesita acceso HTTPS saliente al proyecto
Supabase. Sirve **todo el puente en el mismo origen**, incluidas `/login.html`,
`/app.js`, `/authorize`, `/session`, `/approve`, `/deny` y `/token`. No habilites
CORS ni registres cuerpos de solicitudes, cabeceras Authorization, cookies o
query strings en los logs del proxy. Configura límites de tráfico en el proxy.

Inicio con las variables ya inyectadas:

```bash
npm run start:broker
```

Si el proveedor usa un archivo privado de variables, Node admite:

```bash
node --env-file=/ruta/privada/evoll.env broker/server.js
```

Readiness: `GET /health` devuelve `{"status":"ok"}`; después inicia un flujo
real desde Alexa. El health check por sí solo no valida Supabase ni las cuentas.
Sin configuración el servidor falla al arrancar, en lugar de usar credenciales
inventadas. Se probó el handler HTTP real localmente con Supabase simulado.

### 3. Account Linking en Alexa Developer Console

Activa la vinculación y usa:

| Campo | Valor |
| --- | --- |
| Authorization grant type | Authorization Code Grant |
| Web Authorization URI | `<BROKER_ORIGIN>/authorize` |
| Access Token URI | `<BROKER_ORIGIN>/token` |
| Client ID | El mismo `OAUTH_CLIENT_ID` del puente |
| Client Secret | El mismo secreto, introducido de forma privada en Amazon |
| Client Authentication Scheme | **HTTP Basic** |
| Scope | `evoll` |

Copia TODAS las URLs de retorno que muestra Amazon a `ALEXA_REDIRECT_URIS`.
El puente gestiona `state`; no inventes ni sustituyas esas URLs. La duración del
token se envía en `expires_in` y Alexa renueva mediante `/token`.

No se solicita que habilites Data API, cambies tablas, desactives RLS o publiques
la app móvil. La pantalla actual admite usuarios de Evoll con correo y contraseña;
Apple/SSO sin contraseña requeriría añadir ese método de login antes de vincular.

### 4. Probar en tu casa

Activa **Test → Development** en Amazon. En la app Alexa de la misma cuenta,
activa la skill de desarrollo y pulsa **Vincular cuenta**. Entra en Evoll,
revisa el consentimiento y autoriza. No envíes contraseñas ni códigos al chat.

Prueba una consulta de gastos y otra de tareas y compara con el móvil. Prueba
también desvincular y abrir la skill: debe aparecer la tarjeta de vinculación.
La disponibilidad de la skill depende del idioma y marketplace de la cuenta.
No necesitas publicar la skill en la tienda para pruebas personales.

Los datos se pronuncian por el altavoz: cualquier persona cercana puede oírlos.
Esta versión no incorpora un PIN de voz ni identificación individual del hablante.

## Renovación, revocación y límites

Las vinculaciones caducan a los 90 días y hay que volver a vincularlas. Si cambia
la clave de cifrado o se pierde SQLite, las sesiones dejan de poder renovarse.
Mantén la clave en un gestor de secretos y backups cifrados de la base.

Para revocar TODOS los enlaces administrados por este puente, con las mismas
variables de producción inyectadas:

```bash
node broker/revoke.js --all
```

Elimina códigos y refresh tokens del puente. Un access token ya emitido conserva
su validez hasta su expiración normal de Supabase. Desvincular en Alexa impide su
uso desde esa skill; para revocación inmediata de todos los JWT sería necesaria
una política adicional del backend. No se ha cambiado esa política de LifeOs.

Este servidor está preparado para una instancia personal con SQLite. Antes de
un despliegue multiusuario público se necesita evaluar escala, protección de
tráfico y operación de secretos. No es un proveedor OAuth certificado.

## Accesos pendientes en esta sesión

- Amazon Developer: no hay perfil ASK configurado.
- AWS: los archivos de configuración/credenciales presentes no contienen perfiles.
- Puente: falta elegir un alojamiento HTTPS y su dominio, además de configurar
  la clave pública de Supabase y los secretos del servicio de forma privada.
- La prueba real autenticada y la prueba en Echo permanecen pendientes.

La autorización de red hacia Supabase ya permite alcanzar el agente, pero no
concede autorización para entrar en Amazon ni para desplegar recursos AWS.

## Docker en un VPS (Hostinger u otro proveedor)

Se incluyen `Dockerfile` y `compose.yaml`. El contenedor usa Node 24, usuario sin
privilegios, sistema de archivos de solo lectura, volumen persistente para SQLite
y límite inicial de 256 MB de RAM / media CPU. La medición local fuera de Docker
fue de unos 39 MB de RAM en reposo; no es una medición de concurrencia.

1. Copia este proyecto al VPS conservando cualquier instalación existente.
2. Configura `broker/.env` de forma privada a partir de `broker/.env.example`.
   Debe contener los valores reales descritos arriba. Protege el archivo con
   permisos `600`. No ejecutes `docker compose config` sin `--quiet` cuando haya
   secretos, porque el resultado expandido puede mostrarlos.
3. Comprueba que el puerto local 3187 esté libre. Si necesitas otro, define
   `EVOLL_LOCAL_PORT` en el entorno de Compose o en un archivo `.env` local.
4. Ejecuta desde la carpeta del proyecto:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3187/health
```

El puerto solo se publica en `127.0.0.1`; no expongas 3187 a Internet. Configura el
proxy HTTPS existente del servidor para enviar el subdominio elegido al puerto
local 3187. Si el proxy está en otro contenedor, necesitará una red Docker común
y acceso a `linking:3000`; adapta la red a la instalación existente antes de
exponerlo. No ocupes ni reemplaces los puertos 80/443 sin revisar el proxy actual.

El dominio debe resolver al VPS y `BROKER_ORIGIN` debe coincidir exactamente con
su origen HTTPS. Verifica después `/health` desde HTTPS y realiza la vinculación
real desde la app Alexa. No basta con que el contenedor aparezca como healthy.

Actualizaciones: conserva `broker/.env`, la clave de cifrado y el volumen, y usa
`docker compose up -d --build`. No uses `docker compose down -v`: borraría las
sesiones. Para volver atrás conserva la imagen anterior antes de actualizar.
El despliegue remoto requiere acceso SSH autorizado; guardar los archivos Docker
localmente no significa que ya estén ejecutándose en Hostinger.

Validación Docker local completada: construcción de imagen, inicio mediante Compose,
health HTTP, usuario UID 1000 y persistencia cifrada tras reiniciar. Se eliminó
únicamente el proyecto temporal usado en esta prueba. No se accedió ni cambió el VPS.

## Configuración elegida para Hostinger

Dominio: `alexa.evoll.app`. Red externa del Nginx Proxy Manager existente:
`nginx_network`, confirmada mediante la inspección compartida por el usuario.
Usa el archivo adicional `compose.hostinger.yaml`. No crea, sustituye ni elimina
esa red ni sus contenedores actuales.

- DNS: registro A de `alexa` hacia `72.60.29.72`. La consulta DNS desde el entorno
  de desarrollo todavía no resolvió el nombre; verificarlo desde otra red antes
  de concluir que falta el registro.
- Configurar `broker/.env` con valores reales antes de arrancar.
- Arranque: `docker compose -f compose.yaml -f compose.hostinger.yaml up -d --build`.
- En Nginx Proxy Manager crear un Proxy Host nuevo para `alexa.evoll.app`:
  scheme `http`, hostname `evoll-alexa-linking`, port `3000`.
- Solicitar certificado Let's Encrypt y activar Force SSL. No modificar los
  Proxy Hosts existentes. Evitar logs con tokens, cookies o query strings.
- Probar `https://alexa.evoll.app/health`, después el flujo real de Alexa.
- Account linking: authorization URL `https://alexa.evoll.app/authorize`, token URL
  `https://alexa.evoll.app/token`, HTTP Basic y scope `evoll`.

Esta configuración sigue sin desplegarse en el servidor. Los datos de Amazon
(Skill ID y redirect URIs exactas) y los secretos del puente siguen siendo
requisitos para ejecutar el flujo real. No usar URLs o claves ficticias.
