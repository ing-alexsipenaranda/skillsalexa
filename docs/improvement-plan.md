# Plan de mejoras y criterios de cierre

Revisión: 2 de noviembre de 2026. Código probado localmente no equivale a una
versión desplegada o validada en un Echo. Este plan complementa ROADMAP.md.

## Correcciones entregadas en esta revisión

- El paquete independiente del broker incluye privacidad y términos; antes
  esas rutas quedaban sin sus archivos HTML al instalar desde el archivo tar.
- Los cuatro paquetes usan listas explícitas de archivos y metadatos estables.
  Los archivos adicionales del equipo no entran en los paquetes.
- Una prueba aislada introduce archivos locales ficticios, modifica fechas y
  sustituye un archivo por un enlace simbólico para verificar esas garantías.
- GitHub Actions ejecuta el preflight completo y conserva los cuatro paquetes,
  iconos y SHA256SUMS como evidencia descargable.
- La guía usa la variable real de despliegue de Supabase y evita adelantar Git
  antes de que el actualizador capture el commit de recuperación.

La revisión de nombres de archivos no detecta secretos escritos dentro del
código permitido. La revisión de cambios sigue siendo necesaria.

## Prioridad 1: demostrar el recorrido completo

**Trabajo:** aplicar migraciones y funciones de LifeOs, actualizar broker y
Lambda, vincular una cuenta de prueba y ejecutar la lista de lanzamiento.
**Cierre:** apertura, consulta, confirmación de tarea, cancelación y revocación
funcionan en simulador y Echo, en español e inglés. Las consultas coinciden con
los datos de la app; otra cuenta no puede acceder a ellos.
**Dependencias:** acceso privado a Supabase y Amazon; Echo del propietario.
**Evidencia:** commits desplegados, resultados y duración, sin datos personales.

## Prioridad 2: actualización y recuperación comprobables

**Trabajo:** probar el actualizador con Docker simulado y en un entorno separado;
rechazar árboles Git con cambios locales, impedir despliegues simultáneos y
probar fallos de build, arranque y health. Verificar restauración de SQLite.
**Cierre:** cada fallo deja recuperable la versión anterior y conserva cambios
locales y datos. El rollback de imagen se valida junto con el de configuración.
**Pendiente detectado:** el actualizador usa `git reset --hard` al fallar y aún
carece de una comprobación previa de cambios locales y bloqueo de concurrencia.

## Prioridad 3: conversación equivalente en ambos idiomas

**Trabajo:** pruebas parametrizadas para los cuatro locales, incluyendo ayuda,
repetición, más detalles, sí/no, sesión vencida, permisos desactivados y errores.
Añadir aclaraciones para fechas ambiguas y solicitudes incompletas.
**Cierre:** cada recorrido responde en el idioma correcto, no pierde una acción
pendiente y no confirma escrituras que el backend no haya guardado.
**Medición:** latencia real por tipo de consulta y porcentaje de timeouts;
optimizar según esas mediciones sin registrar el contenido de las consultas.

## Prioridad 4: privacidad durante toda la sesión

**Trabajo:** probar cambios de permisos entre turnos, repetición después de
activar privacidad y revocación durante una sesión. Revisar también las tarjetas.
**Cierre:** ningún texto financiero previamente obtenido reaparece después de
activar privacidad; una sesión revocada deja de consultar al backend según la
política de expiración y revocación realmente implementada.
**Decisión pendiente:** evaluar protección adicional para datos sensibles; no
presentar un PIN hablado como identificación fiable de una persona.

## Prioridad 5: operación y publicación

**Trabajo:** conectar alertas, ensayar restauración, completar contacto oficial,
configurar proveedores sociales y ejecutar certificación por idioma.
**Cierre:** una persona puede detectar una caída y restaurar el servicio siguiendo
la documentación; Google y Apple se prueban con cuentas reales si se habilitan.

## Prioridad 6: ampliar funciones con confirmación

**Trabajo:** primero recordatorios nativos de Alexa, después otras escrituras
seleccionadas. Definir permisos, cancelación, zona horaria e idempotencia para
cada una antes de implementarla.
**Cierre:** las operaciones solo se ejecutan con autorización y confirmación,
un reintento no duplica datos y los fallos se explican sin afirmar éxito.
**Dependencias:** recorrido real y privacidad de prioridades 1 y 4 validados.

## Próxima entrega recomendada

Endurecer y probar `scripts/update-vps.sh` antes de usarlo para la próxima
actualización. Después ampliar la matriz de conversación ES/EN. Estas dos tareas
pueden prepararse en el repositorio sin acceso al servidor de producción.
