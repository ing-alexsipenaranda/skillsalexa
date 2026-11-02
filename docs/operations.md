# Operación del broker

## Monitorización y backups programados

Los archivos de `ops/systemd/` están preparados para `/opt/evoll-alexa`.
Revisa esa ruta y ejecuta en el VPS después de actualizar el repositorio:

```bash
sudo install -m 644 ops/systemd/evoll-alexa-* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now evoll-alexa-health.timer evoll-alexa-backup.timer
sudo systemctl start evoll-alexa-health.service
sudo systemctl list-timers 'evoll-alexa-*'
```

Para alertas, guarda `ALERT_WEBHOOK_URL` en `/etc/evoll-alexa-monitor.env`, propiedad
root y permisos 600. Debe aceptar JSON con un campo `text`. La URL puede contener
un secreto: no la guardes en Git ni la envíes al chat. El health check verifica
que Docker indique `running healthy` y que HTTPS responda. Un fallo produce
salida no cero y, si el webhook está configurado, envía un aviso genérico.

La comprobación corre cada cinco minutos. La copia diaria corre cerca de las
04:00 UTC y conserva 14 días. Las copias son locales: añade un destino privado
externo antes de considerarlas protección frente a pérdida del VPS. Respalda
la clave de cifrado por separado; perderla hace ilegibles las sesiones.

La prueba automatizada restaura una copia de SQLite creada con WAL activo,
comprueba integridad, descifra una sesión y rechaza una clave incorrecta.
Todavía hace falta ensayar la recuperación con una copia del VPS en un destino
separado. Nunca restaures una base sobre otra abierta por el broker.

## Actualizaciones

Ejecuta `scripts/update-vps.sh` desde la rama `codex/evoll-alexa`, con Git limpio.
Requiere una imagen anterior disponible: está diseñado para actualizar, no para
la primera instalación. Un bloqueo en `.git` impide ejecutar dos actualizaciones
simultáneas. Conserva backup, imagen y commit anterior; si falla, usa `git reset
--keep`, que rechaza sobrescribir cambios concurrentes. Cuando ya hubo cambio
de contenedor, reinicia la imagen anterior y verifica su salud. Un rollback que
no supera health se informa como recuperación manual pendiente.

Las pruebas usan repositorios Git temporales y Docker/HTTP simulados. Cubren
éxito, árbol sucio, lock ocupado, error de build, arranque y health. Queda por
probar esos escenarios con Docker real en staging.

## Capacidad y límites

El broker actual usa una sola réplica con SQLite persistente. Las cuotas de CPU,
memoria, procesos y logs están en Compose. No aumentes las réplicas compartiendo
archivos SQLite ni dando a cada réplica una base diferente: los códigos OAuth
solo pueden consumirse una vez y deben compartir el mismo estado.

Antes de crecer: medir p95 de latencia, errores y uso de memoria sin registrar
contenido; después mover sesiones y códigos a un almacén transaccional compartido
con consumo atómico, expiración y cifrado. Probar refresh concurrente y aislamiento
por usuario antes de activar múltiples réplicas. Lambda y las Edge Functions
siguen escalando por separado; la cuota de consultas limita gasto de IA.
