# Operación e incidentes

## Señales

- `scripts/health-vps.sh` falla o envía un webhook.
- Alexa responde que Evoll no pudo contestar.
- Aumentan los eventos `network_error`, `upstream_error` o la duración.
- La vinculación de cuenta deja de abrir o renovar tokens.

Los logs no deben contener preguntas, respuestas, tokens, cookies, correos ni
parámetros OAuth. Las métricas permitidas son evento, estado, duración y tipo
general de acción.

## Diagnóstico

1. Ejecutar `scripts/health-vps.sh`.
2. Revisar `docker ps --filter name=evoll-alexa-linking-1`.
3. Revisar únicamente los últimos eventos con
   `docker logs --tail 100 evoll-alexa-linking-1`.
4. Comprobar el estado de Supabase y la Edge Function `agent`.
5. Revisar métricas de Lambda sin copiar tokens ni solicitudes al ticket.

Después de un despliegue, ejecutar `scripts/verify-production.sh`. Comprueba las
rutas públicas y confirma que `revoke-user`, `agent` y `alexa-actions` rechacen
solicitudes anónimas. No usa credenciales ni crea datos.

## Actualización y rollback

`scripts/update-vps.sh` respalda SQLite, conserva la imagen anterior, actualiza
solo el servicio `linking`, valida health interno y externo y restaura la imagen
y checkout anteriores si falla. No reinicia Nginx Proxy Manager ni otros
contenedores.

Ante un incidente de Supabase, revertir primero las funciones. Las migraciones
de preferencias son aditivas; no borrar columnas mientras existan clientes que
las usen. Ante pérdida de SQLite, restaurar el backup junto con la misma
`TOKEN_ENCRYPTION_KEY`.

## Credencial expuesta

1. Revocar o rotar inmediatamente la credencial afectada.
2. Para el secreto OAuth, actualizar broker y Alexa Developer Console juntos.
3. Para la clave de cifrado, revocar todas las vinculaciones y exigir relink;
   cambiarla vuelve ilegibles las sesiones existentes.
4. Revisar logs y accesos sin publicar valores sensibles.
5. Documentar alcance, ventana y acciones correctivas.
