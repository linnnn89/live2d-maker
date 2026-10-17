"""Read-only Windows MCP diagnostic, using the repository's existing stdio proxy."""
import argparse
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import sys
from urllib.parse import urlsplit


def check(root, timeout):
    proxy = root / 'psd2live' / 'mcp_proxy.py'
    app = root / 'portable' / 'PSD2Live' / 'PSD2Live.exe'
    print(f'[1/4] Python {sys.version.split()[0]}: {sys.executable}', flush=True)
    if not proxy.is_file() or not app.is_file():
        print('[FAIL] 当前仓库缺少 MCP Proxy 或便携程序；请先运行 dependencies\\install.bat。')
        return 2
    spec = importlib.util.spec_from_file_location('psd2live_mcp_proxy', proxy)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Reuse the proxy's environment/Java Preferences decoding and never print credentials.
    if not module.get_token():
        print('[2/4] [FAIL] 未找到 MCP 凭据；先启动 PSD2Live，或为当前进程设置 PSD2LIVE_MCP_TOKEN。')
        return 2
    print('[2/4] [OK] MCP 凭据可用', flush=True)
    endpoint = urlsplit(module.ENDPOINT)
    if endpoint.scheme not in ('http', 'https') or not endpoint.hostname:
        print('[3/4] [FAIL] PSD2LIVE_MCP_ENDPOINT 必须是 HTTP(S) 地址。')
        return 2
    try:
        port = endpoint.port or (443 if endpoint.scheme == 'https' else 80)
        with socket.create_connection((endpoint.hostname, port), timeout=min(timeout, 2)):
            pass
    except (OSError, ValueError):
        print('[3/4] [OFFLINE] MCP 地址不可连接；未启动应用。')
        return 1
    print(f'[3/4] [OK] {endpoint.hostname}:{port} 可连接', flush=True)
    messages = [
        {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': '2025-03-26', 'capabilities': {},
            'clientInfo': {'name': 'psd2live-check', 'version': '1.0'}}},
        {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
        {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}},
    ]
    process = subprocess.Popen([sys.executable, str(proxy)], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8',
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        stdout, _ = process.communicate(''.join(json.dumps(m) + '\n' for m in messages), timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        print(f'[4/4] [FAIL] MCP 握手超过 {timeout:g} 秒，已结束本次 Proxy。')
        return 1
    try:
        replies = [json.loads(line) for line in stdout.splitlines() if line.strip()]
        by_id = {reply['id']: reply for reply in replies if isinstance(reply, dict) and 'id' in reply}
        initialized = by_id[1]['result']
        tools = by_id[2]['result']['tools']
        if (process.returncode != 0 or initialized['serverInfo']['name'] != 'psd2live'
                or not isinstance(tools, list) or not tools
                or any(not isinstance(tool, dict) or not isinstance(tool.get('name'), str) for tool in tools)):
            raise ValueError('Unexpected MCP response')
    except (ValueError, KeyError, TypeError):
        print('[4/4] [FAIL] MCP 初始化或工具列表无效；请检查地址、凭据及应用日志。')
        return 1
    print(f'[4/4] [OK] PSD2Live MCP 握手通过，{len(tools)} 个工具；测试 Proxy 已退出。')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, default=10, help='Proxy handshake deadline in seconds')
    args = parser.parse_args()
    if not 0 < args.timeout <= 60:
        parser.error('--timeout must be greater than 0 and at most 60')
    try:
        return check(Path(__file__).resolve().parent.parent, args.timeout)
    except (OSError, ValueError):
        print('[FAIL] 无法运行本仓 MCP 诊断；请检查项目 Python 和 MCP 配置。')
        return 2


if __name__ == '__main__':
    sys.exit(main())
