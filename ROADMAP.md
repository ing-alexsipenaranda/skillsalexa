# Plan de evolución de Evoll para Alexa

Este plan ordena el trabajo por dependencia. Una etapa se considera terminada
solo cuando cumple sus criterios de aceptación, no únicamente cuando el código
está desplegado.

## Estado actual

- [x] Skill personalizada desplegada y operativa en el simulador de Alexa.
- [x] Backend OAuth disponible por HTTPS en `alexa.evoll.app`.
- [x] Health checks interno y público correctos.
- [x] Modelos para `es-ES`, `es-MX` y `es-US` con invocación `asistente evol`.
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
- [ ] Automatizar un backup cifrado diario de la base SQLite del broker y probar
  una restauración.
- [ ] Añadir health check de Docker y alerta cuando `alexa.evoll.app/health` falle.
- [ ] Definir actualización segura del contenedor con rollback.
- [ ] Revisar logs para garantizar que nunca registren tokens, contraseñas,
  cookies ni parámetros OAuth.

**Aceptación:** se puede recuperar la vinculación después de recrear el
contenedor y ninguna credencial aparece en repositorio o logs.

## Etapa 3 — Mejor experiencia de voz

- [ ] Respuestas breves por defecto, con opción «dame más detalles».
- [ ] Ayuda contextual y ejemplos según el módulo consultado.
- [ ] Soportar «repite», «sí», «no» y preguntas consecutivas con contexto corto.
- [ ] Diferenciar claramente cuenta sin vincular, sesión vencida, límite y caída
  temporal del agente.
- [ ] Añadir tarjetas útiles para Echo Show sin mostrar información sensible de más.
- [ ] Medir duración de las consultas y reducir las que se acerquen al timeout.

**Aceptación:** las consultas comunes requieren una sola frase, la respuesta no
se corta y el usuario entiende cómo continuar ante cualquier error.

## Etapa 4 — Privacidad en el hogar

- [ ] Permitir ocultar saldos y movimientos detallados por configuración.
- [ ] Evaluar un PIN de voz para consultas financieras sensibles.
- [ ] Añadir aviso claro sobre respuestas audibles por personas cercanas.
- [ ] Definir qué módulos puede consultar Alexa desde preferencias de Evoll.

**Aceptación:** el propietario controla qué se puede pronunciar y las consultas
sensibles requieren la protección elegida.

## Etapa 5 — Funciones nuevas

- [ ] Resumen diario: tareas, agenda, metas y alertas financieras.
- [ ] Consultas rápidas dedicadas para tareas, gastos, presupuesto y deudas.
- [ ] Recordatorios de Alexa para compromisos seleccionados por el usuario.
- [ ] Acciones de escritura con confirmación explícita, idempotencia y auditoría.
- [ ] Sincronizar preferencias de voz con la aplicación Evoll.

Las escrituras se implementarán después de privacidad y seguridad. Alexa debe
leer la acción propuesta, pedir confirmación y evitar duplicados si Amazon
reintenta una solicitud.

## Etapa 6 — Publicación y operación

- [ ] Completar política de privacidad, términos, iconos y ficha de distribución.
- [ ] Ejecutar pruebas funcionales y de certificación para cada idioma.
- [ ] Preparar ambiente de pruebas separado de producción.
- [ ] Documentar métricas, alertas, soporte y procedimiento de incidentes.
- [ ] Solicitar certificación únicamente cuando el flujo personal sea estable.

**Aceptación:** una instalación nueva puede operarse y recuperarse siguiendo la
documentación, y la skill cumple las pruebas de certificación de Amazon.

