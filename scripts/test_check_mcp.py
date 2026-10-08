"""Run the diagnostic and real stdio proxy against a bounded HTTP fixture."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest


class McpDiagnosticTest(unittest.TestCase):
    def test_relocated_diagnostic_checks_protocol_and_bounds_shutdown(self):
        root = Path(__file__).resolve().parent.parent
        token = 'diagnostic-test-credential-00000001'
        with tempfile.TemporaryDirectory(prefix='mcp check ') as temporary:
            relocated = Path(temporary)
            for relative in ('scripts/check_mcp.py', 'psd2live/mcp_proxy.py'):
                target = relocated / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(root / relative, target)
            app = relocated / 'portable/PSD2Live/PSD2Live.exe'
            app.parent.mkdir(parents=True)
            app.touch()
            state = {'mode': 'ok', 'deleted': 0}

            class Handler(BaseHTTPRequestHandler):
                def log_message(self, *args):
                    pass

                def do_DELETE(self):
                    state['deleted'] += 1
                    self.send_response(200)
                    self.end_headers()

                def do_POST(self):
                    message = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    if state['mode'] == 'slow':
                        time.sleep(2)
                    if message['method'] == 'notifications/initialized':
                        self.send_response(202)
                        self.end_headers()
                        return
                    result = ({'protocolVersion': '2025-03-26', 'capabilities': {}, 'serverInfo': {
                        'name': 'other' if state['mode'] == 'wrong-server' else 'psd2live', 'version': '1'}}
                        if message['method'] == 'initialize' else {'tools': [{'name': 'inspect'}]})
                    payload = json.dumps({'jsonrpc': '2.0', 'id': message['id'], 'result': result}).encode()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Mcp-Session-Id', 'diagnostic-fixture')
                    self.send_header('Content-Length', str(len(payload)))
                    self.end_headers()
                    try:
                        self.wfile.write(payload)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        pass

            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            env = dict(os.environ, PSD2LIVE_MCP_TOKEN=token,
                       PSD2LIVE_MCP_ENDPOINT=f'http://127.0.0.1:{server.server_port}/mcp',
                       PYTHONIOENCODING='utf-8')

            def run(timeout='3'):
                return subprocess.run([sys.executable, str(relocated / 'scripts/check_mcp.py'),
                    '--timeout', timeout], cwd=temporary, env=env, capture_output=True,
                    text=True, encoding='utf-8', timeout=8)

            try:
                success = run()
                self.assertEqual(0, success.returncode, success.stdout + success.stderr)
                self.assertIn('[4/4] [OK]', success.stdout)
                self.assertNotIn(token, success.stdout + success.stderr)
                self.assertEqual(1, state['deleted'], 'Proxy EOF must close its HTTP session')

                state['mode'] = 'wrong-server'
                invalid = run()
                self.assertEqual(1, invalid.returncode)
                self.assertIn('[4/4] [FAIL]', invalid.stdout)

                state['mode'] = 'slow'
                started = time.monotonic()
                timed_out = run('0.3')
                self.assertEqual(1, timed_out.returncode)
                self.assertIn('已结束本次 Proxy', timed_out.stdout)
                self.assertLess(time.monotonic() - started, 3)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(2)

            # Reserve an unused local port without depending on the default application's state.
            with socket.socket() as unused:
                unused.bind(('127.0.0.1', 0))
                port = unused.getsockname()[1]
                env['PSD2LIVE_MCP_ENDPOINT'] = f'http://127.0.0.1:{port}/mcp'
                offline = run('0.3')
            self.assertEqual(1, offline.returncode)
            self.assertIn('[OFFLINE]', offline.stdout)


if __name__ == '__main__':
    unittest.main()
