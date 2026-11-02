# Alertas de Evoll por Telegram

## Crear el bot y elegir el chat

1. En Telegram abre el bot oficial **@BotFather**, envía `/newbot` y sigue los
   pasos. Guarda el token que entrega como `TELEGRAM_BOT_TOKEN`.
2. Abre tu bot y pulsa **Iniciar** o envíale `/start`. El bot no puede iniciar
   una conversación privada contigo hasta que lo hagas.
3. Obtén el ID numérico del chat de destino. Para un chat privado puedes usar
   **@userinfobot**; no le envíes el token del bot. Para un grupo, añade tu bot y
   usa el ID de ese grupo (suele ser negativo), no tu ID personal.

El código admite un único chat numérico configurado. El token y el chat se leen
del entorno y no se pasan como argumentos de procesos ni se incluyen en logs.

## Guardar la configuración en el VPS

Tras obtener los dos valores, abre el archivo privado en el servidor:

```bash
sudo touch /etc/evoll-alexa-monitor.env
sudo chown root:root /etc/evoll-alexa-monitor.env
sudo chmod 600 /etc/evoll-alexa-monitor.env
sudo nano /etc/evoll-alexa-monitor.env
```

Conserva las variables existentes y añade estas líneas con los valores reales:

```dotenv
TELEGRAM_BOT_TOKEN=TOKEN_DEL_BOT
TELEGRAM_CHAT_ID=ID_NUMERICO_DEL_CHAT
```

No pegues el token en Git ni en el chat de asistencia. El archivo está fuera del
repositorio y systemd lo carga mediante `EnvironmentFile`.

## Prueba explícita y activación

Después de instalar los cambios en `/opt/evoll-alexa`, ejecuta en el VPS:

```bash
sudo bash -c 'set -a; . /etc/evoll-alexa-monitor.env; set +a; python3 /opt/evoll-alexa/scripts/telegram-alert.py --test'
```

Este comando envía un mensaje de prueba al chat configurado. Debe imprimir
`Aviso enviado a Telegram.` y aparecer el aviso en tu Telegram. No confirma
el estado de salud de la skill; comprueba únicamente la entrega de mensajes.

Instala los temporizadores siguiendo [operations.md](operations.md). El archivo
de variables se vuelve a leer al ejecutar cada comprobación; no hay que reiniciar
Docker. Para revisar fallos:

```bash
sudo journalctl -u evoll-alexa-health.service -n 30 --no-pager
```

Si no llega el aviso, revisa token, chat, `/start`, pertenencia del bot al grupo
y salida HTTPS hacia `api.telegram.org`. No se reintenta automáticamente el envío:
un timeout puede ocurrir después de que Telegram haya aceptado el mensaje.
Si el fallo de salud continúa, habrá otro aviso en la siguiente comprobación
(aproximadamente cada cinco minutos). No hay aviso de recuperación implementado.

El monitor vive en el VPS: si el VPS entero o su conexión caen, no podrá avisar.
Para cubrir ese caso hace falta además un monitor externo de disponibilidad.
