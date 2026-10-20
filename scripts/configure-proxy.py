#!/usr/bin/env python3
"""Configure only the dedicated Evoll Proxy Host through NPM's local API."""
import getpass
import json
import socket
import sys
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:81/api'
DOMAIN = 'alexa.evoll.app'
TARGET = 'evoll-alexa-linking'

class Api:
    def __init__(self):
        self.token = None
        # Local panel calls must not pass through an outbound proxy.
        self.client = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def call(self, method, path, data=None, timeout=180):
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        req = urllib.request.Request(BASE + path, method=method, headers=headers,
            data=None if data is None else json.dumps(data).encode())
        try:
            with self.client.open(req, timeout=timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            # Classify known responses, never echo API bodies or submitted credentials.
            hint = ''
            try:
                payload = json.loads(error.read(16384))
                detail = payload.get('error', {})
                message = (detail.get('message', '') if isinstance(detail, dict) else str(detail)).lower()
                if path == '/tokens':
                    if any(term in message for term in ['invalid email or password', 'invalid credentials', 'invalid identity or password']):
                        hint = ' El panel rechazó el correo o la contraseña. Usa las credenciales del panel, no las de SSH.'
                    elif 'disabled' in message:
                        hint = ' La cuenta del panel está deshabilitada.'
                    elif any(term in message for term in ['required', 'validation', 'schema', 'short', 'minlength']):
                        hint = ' La API rechazó el formato de los campos de acceso; revisa que correo y contraseña estén completos.'
            except (ValueError, TypeError, AttributeError):
                pass
            raise RuntimeError(f'API {method} {path}: HTTP {error.code}.' + hint + ' No se muestran datos sensibles de la respuesta.') from None


def main():
    try:
        socket.getaddrinfo(DOMAIN, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise RuntimeError(f'{DOMAIN} no resuelve desde el VPS. Corrige o espera el DNS antes de continuar.')
    print('Solo se configurará ' + DOMAIN + ' → http://' + TARGET + ':3000')
    identity = input('Correo de acceso al panel Nginx Proxy Manager: ').strip()
    if not identity:
        raise RuntimeError('Falta el correo del panel.')
    password = getpass.getpass('Contraseña del panel (no se mostrará): ')
    api = Api()
    result = api.call('POST', '/tokens', {'identity': identity, 'secret': password})
    del password
    api.token = result.get('token')
    if not api.token:
        raise RuntimeError('El panel no devolvió una sesión válida.')
    hosts = api.call('GET', '/nginx/proxy-hosts')
    matches = [h for h in hosts if DOMAIN in h.get('domain_names', [])]
    if len(matches) > 1:
        raise RuntimeError('Hay varios hosts para este dominio. No se modificó ninguno.')
    if matches:
        host = matches[0]
        if (host.get('domain_names') != [DOMAIN]
            or host.get('forward_host') != TARGET
            or int(host.get('forward_port', 0)) != 3000
            or host.get('forward_scheme') != 'http'
            or not host.get('enabled', True)):
            raise RuntimeError('Ya existe un host diferente para Evoll. Se detuvo para no sobrescribirlo.')
        print('Reutilizando el host dedicado existente; no se crearán duplicados.')
        if host.get('certificate_id') and host.get('ssl_forced'):
            print('El host ya tiene certificado y Force SSL. Verifica https://' + DOMAIN + '/health')
            return
    else:
        host = api.call('POST', '/nginx/proxy-hosts', {
            'domain_names': [DOMAIN], 'forward_scheme': 'http',
            'forward_host': TARGET, 'forward_port': 3000,
            'access_list_id': 0, 'certificate_id': 0, 'ssl_forced': False,
            'caching_enabled': False, 'block_exploits': True,
            'advanced_config': '', 'meta': {}, 'allow_websocket_upgrade': False,
            'http2_support': False, 'hsts_enabled': False,
            'hsts_subdomains': False, 'locations': [],
        })
        print('Creado únicamente el Proxy Host de Evoll (HTTP).')
    cert_id = host.get('certificate_id', 0)
    if not cert_id:
        print('Solicitando certificado Let’s Encrypt; puede tardar unos minutos.')
        email = input('Correo para avisos de Let’s Encrypt [Enter: el del panel]: ').strip() or identity
        agree = input('¿Aceptas los términos de Let’s Encrypt (https://letsencrypt.org/repository/)? Escribe si: ').strip().lower()
        if agree not in ('si', 'sí'):
            raise RuntimeError('Certificado pendiente: no se aceptaron los términos. El host HTTP se conserva.')
        cert = api.call('POST', '/nginx/certificates', {
            'provider': 'letsencrypt', 'nice_name': DOMAIN,
            'domain_names': [DOMAIN],
            'meta': {'letsencrypt_email': email, 'letsencrypt_agree': True, 'dns_challenge': False},
        })
        cert_id = cert['id']
    # Keep the dedicated host settings; never update another domain or the container itself.
    fields = ['domain_names', 'forward_scheme', 'forward_host', 'forward_port',
        'access_list_id', 'caching_enabled', 'block_exploits', 'advanced_config',
        'allow_websocket_upgrade', 'http2_support', 'hsts_enabled', 'hsts_subdomains', 'locations']
    settings = {key: host[key] for key in fields if key in host}
    settings.update(certificate_id=cert_id, ssl_forced=True, meta=host.get('meta') or {})
    api.call('PUT', '/nginx/proxy-hosts/' + str(host['id']), settings)
    print('HTTPS y Force SSL configurados. No se reinició ningún contenedor.')
    print('Comprueba: curl --max-time 15 --fail https://' + DOMAIN + '/health')

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print('No se completó la configuración: ' + str(error), file=sys.stderr)
        print('Los demás hosts no se modifican. No borres ni reinicies nginx.', file=sys.stderr)
        sys.exit(1)
