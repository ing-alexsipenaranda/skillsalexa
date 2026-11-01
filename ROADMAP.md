# Plan de evolución de Evoll para Alexa

Este plan ordena el trabajo por dependencia. Una etapa se considera terminada
solo cuando cumple sus criterios de aceptación, no únicamente cuando el código
está desplegado.

## Estado actual

- [x] Skill personalizada desplegada y operativa en el simulador de Alexa.
- [x] Backend OAuth disponible por HTTPS en `alexa.evoll.app`.
- [x] Health checks interno y público correctos.
- [x] Modelos para `es-ES`, `es-MX` y `es-US` con invocación `asistente evol`.
- [x] Modelo `en-US`, respuestas internas en inglés y consultas bilingües al agente.
- [x] Conexión de la Lambda con el agente de LifeOs/Supabase.
- [ ] Skill visible y cuenta vinculada desde la app Alexa.
- [ ] Prueba autenticada en un Echo físico.

## Etapa 1 — Cerrar el flujo real

Prioridad máxima. No se empieza una función nueva hasta validar este recorrido.

- [ ] Confirmar que el idioma del Echo coincide con un idioma habilitado en la skill.
- [ ] Confirmar que Alexa Developer Console y la app Alexa usan la misma cuenta Amazon.
- [ ] Localizar la skill en **Skills y juegos → Tus skills → Dev**.
- [ ] Vincular una cuenta real de Evoll.
- [ ] Consultar tareas y gastos desde el Echo y comparar las respuestas con la app.
- [ ] Desvincular y volver a vincular para validar el ciclo completo.

**Aceptación:** «Alexa, abre asistente evol» responde con datos correctos del
usuario vinculado y otra cuenta no puede leerlos.

## Etapa 2 — Seguridad y continuidad

- [ ] Rotar la contraseña `root` del VPS si sigue siendo la que apareció durante
  la instalación y configurar acceso SSH con clave.
- [ ] Verificar que el secreto OAuth y la clave de cifrado actuales no sean los
  valores que aparecieron en el chat.
- [x] Automatizar un backup consistente de la base SQLite del broker y probar
  una restauración.
- [x] Añadir health checks de Docker y HTTPS utilizables desde cron o monitoreo.
- [ ] Conectar el health check a un canal externo de alertas.
- [x] Definir actualización segura del contenedor con backup y rollback automático.
- [ ] Revisar logs para garantizar que nunca registren tokens, contraseñas,
  cookies ni parámetros OAuth.

**Aceptación:** se puede recuperar la vinculación después de recrear el
contenedor y ninguna credencial aparece en repositorio o logs.

## Etapa 3 — Mejor experiencia de voz

- [x] Respuestas rápidas para tareas, gastos y resumen diario, con opción «dame más detalles».
- [x] Ayuda contextual con ejemplos en español e inglés.
- [x] Soportar «repite» y continuación mediante «más detalles» con contexto corto.
- [x] Mantener hasta cuatro turnos de contexto y enviarlos al agente.
- [x] Soportar «sí» y «no» para confirmar tareas y recordatorios.
- [x] Diferenciar claramente cuenta sin vincular, sesión vencida, límite y caída
  temporal del agente.
- [x] Añadir tarjetas útiles para Echo Show y omitirlas en modo privado.
- [x] Medir duración y estado sin registrar contenido ni identidad del usuario.
- [ ] Analizar métricas reales y reducir las consultas que se acerquen al timeout.

**Aceptación:** las consultas comunes requieren una sola frase, la respuesta no
se corta y el usuario entiende cómo continuar ante cualquier error.

## Etapa 4 — Privacidad en el hogar

- [x] Modo privado por sesión que bloquea consultas financieras sensibles.
- [x] Permitir ocultar saldos y movimientos detallados mediante una preferencia persistente.
- [ ] Evaluar un PIN de voz para consultas financieras sensibles.
- [ ] Añadir aviso claro sobre respuestas audibles por personas cercanas.
- [x] Definir qué módulos puede consultar Alexa desde preferencias de Evoll.

**Aceptación:** el propietario controla qué se puede pronunciar y las consultas
sensibles requieren la protección elegida.

## Etapa 5 — Funciones nuevas

- [x] Resumen diario bajo demanda: tareas, agenda, metas y alertas financieras.
- [x] Consultas rápidas dedicadas para tareas y gastos.
- [x] Consultas rápidas dedicadas para presupuesto y deudas.
- [ ] Recordatorios de Alexa para compromisos seleccionados por el usuario.
- [x] Tareas y recordatorios con confirmación explícita, idempotencia y auditoría.
- [ ] Extender la confirmación segura a las demás acciones de escritura.
- [x] Sincronizar preferencias de voz con la aplicación Evoll.

Las escrituras se implementarán después de privacidad y seguridad. Alexa debe
leer la acción propuesta, pedir confirmación y evitar duplicados si Amazon
reintenta una solicitud.

## Etapa 6 — Publicación y operación

- [x] Añadir correo, Google y Apple a la pantalla de vinculación mediante Supabase Auth.
- [ ] Habilitar Google/Apple y registrar el redirect de producción en Supabase.
- [x] Preparar borradores bilingües de política de privacidad.
- [x] Preparar términos y ficha de distribución bilingües.
- [x] Identificar la fuente oficial y especificaciones de iconos.
- [ ] Añadir contacto oficial, publicar privacidad/términos y exportar los PNG finales.
- [ ] Ejecutar pruebas funcionales y de certificación para cada idioma.
- [ ] Preparar ambiente de pruebas separado de producción.
- [x] Documentar métricas seguras y lista de certificación.
- [x] Documentar procedimiento de incidentes y rollback.
- [ ] Añadir contacto y canal oficial de soporte.
- [ ] Solicitar certificación únicamente cuando el flujo personal sea estable.

**Aceptación:** una instalación nueva puede operarse y recuperarse siguiendo la
documentación, y la skill cumple las pruebas de certificación de Amazon.

