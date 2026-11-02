#!/usr/bin/env python3
"""Send fixed operational notices without logging credentials or API responses."""
import json
import os
import re
import sys
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send_alert(environ, *, test=False, opener=None):
    token = environ.get('TELEGRAM_BOT_TOKEN', '')
    chat = environ.get('TELEGRAM_CHAT_ID', '')
    if not re.fullmatch(r'[0-9]+:[A-Za-z0-9_-]+', token) or not re.fullmatch(r'-?[0-9]+', chat):
        raise ValueError('Invalid Telegram configuration')
    text = ('Evoll Alexa: prueba de alertas. La conexión con Telegram funciona.' if test
            else 'Evoll Alexa: falló la comprobación de salud. Revisa el contenedor y el acceso HTTPS.')
    request = urllib.request.Request(
        f'https://api.telegram.org/bot{token}/sendMessage',
        data=json.dumps({'chat_id': chat, 'text': text}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST',
    )
    # A redirect could disclose the token in the URL or the destination chat.
    opener = opener or urllib.request.build_opener(NoRedirect())
    with opener.open(request, timeout=10) as response:
        if response.status != 200:
            raise ValueError('Telegram rejected the alert')
        result = json.loads(response.read(65536))
        if not isinstance(result, dict) or result.get('ok') is not True:
            raise ValueError('Telegram rejected the alert')


def main():
    if sys.argv[1:] not in ([], ['--test']):
        print('Usage: telegram-alert.py [--test]', file=sys.stderr)
        return 1
    try:
        send_alert(os.environ, test=sys.argv[1:] == ['--test'])
    except Exception:
        # urllib errors can include the URL, which contains the bot token.
        print('No se pudo enviar la alerta de Telegram. Revisa la configuración y conectividad.', file=sys.stderr)
        return 1
    print('Aviso enviado a Telegram.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
