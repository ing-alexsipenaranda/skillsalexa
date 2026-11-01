# Preparación para certificación de Amazon

## Funcionalidad

- Probar `es-ES`, `es-MX`, `es-US` y `en-US` con el modelo compilado.
- Abrir, consultar, repetir, pedir más detalles, detener y cancelar.
- Vincular, renovar y desvincular una cuenta.
- Confirmar y rechazar tareas y recordatorios.
- Verificar que un reintento no crea duplicados.

## Privacidad

- La ficha debe explicar que las respuestas se reproducen en voz alta.
- Publicar una política de privacidad accesible por HTTPS.
- Confirmar que modo privado no genera tarjetas ni historial conversacional.
- Confirmar que los módulos deshabilitados no están disponibles para el modelo.
- Los logs solo pueden contener tipo de evento, estado y duración.

## Seguridad y operación

- Rotar secretos expuestos durante desarrollo antes de certificación.
- Probar restauración del backup cifrado del broker.
- Configurar alerta para health check y revisar el procedimiento de rollback.
- Probar tokens vencidos, cuota, caída de Supabase y timeout del agente.

## Distribución

- Preparar nombre, descripción corta/larga, iconos 108x108 y 512x512.
- Añadir instrucciones de prueba para el revisor sin compartir una cuenta real.
- Completar categorías, mercados, disponibilidad e información de soporte.
- Ejecutar el validador de certificación para cada idioma antes de enviar.
