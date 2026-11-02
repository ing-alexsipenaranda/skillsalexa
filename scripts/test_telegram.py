"""No real Telegram messages: all HTTP calls are simulated."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('telegram_alert', Path(__file__).with_name('telegram-alert.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CONFIG = {'TELEGRAM_BOT_TOKEN': '123456:test-token', 'TELEGRAM_CHAT_ID': '-100123'}


class TelegramTests(unittest.TestCase):
    def test_success_payload_and_timeout(self):
        class Response(io.BytesIO):
            status = 200
        class Opener:
            def open(inner, request, timeout):
                self.assertEqual(timeout, 10)
                self.assertEqual(request.full_url, 'https://api.telegram.org/bot123456:test-token/sendMessage')
                payload = json.loads(request.data)
                self.assertEqual(payload['chat_id'], '-100123')
                self.assertIn('falló', payload['text'])
                self.assertNotIn(CONFIG['TELEGRAM_BOT_TOKEN'], payload['text'])
                return Response(b'{"ok":true}')
        module.send_alert(CONFIG, opener=Opener())

    def test_invalid_or_partial_configuration_never_sends(self):
        for config in [{}, {'TELEGRAM_BOT_TOKEN': CONFIG['TELEGRAM_BOT_TOKEN']},
                       dict(CONFIG, TELEGRAM_BOT_TOKEN='123:secret/evil'),
                       dict(CONFIG, TELEGRAM_CHAT_ID='@unknown')]:
            with self.subTest(config=list(config)), self.assertRaises(ValueError):
                module.send_alert(config, opener=object())

    def test_rejected_and_malformed_api_response(self):
        for status, body in [(200,b'{"ok":false}'),(200,b'not-json'),(200,b'null'),(429,b'{}')]:
            response = io.BytesIO(body)
            response.status = status
            with patch.object(module.urllib.request.OpenerDirector, 'open', return_value=response):
                with self.assertRaises(ValueError):
                    module.send_alert(CONFIG)

    def test_error_output_never_includes_token_or_chat(self):
        output = io.StringIO()
        with patch.dict(module.os.environ, CONFIG), patch.object(module.sys, 'argv', ['telegram-alert.py']), \
             patch.object(module, 'send_alert', side_effect=TimeoutError(str(CONFIG))), \
             contextlib.redirect_stderr(output):
            self.assertEqual(module.main(), 1)
        self.assertNotIn(CONFIG['TELEGRAM_BOT_TOKEN'], output.getvalue())
        self.assertNotIn(CONFIG['TELEGRAM_CHAT_ID'], output.getvalue())

    def test_redirect_is_refused(self):
        self.assertIsNone(module.NoRedirect().redirect_request(None,None,302,'',{},'https://other.test'))


if __name__ == '__main__':
    unittest.main()
