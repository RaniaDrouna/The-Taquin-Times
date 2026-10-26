"""Desktop launcher: starts the A* backend, serves the front-end, opens a native window."""
import http.client
import mimetypes
import socket
import subprocess
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import webview

ROOT = Path(__file__).resolve().parent
FRONT_PORT = 3000
BACK_PORT = 8000

# Windows can map .js to text/plain, which breaks ES modules.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")

HOP_BY_HOP = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"}


class Handler(SimpleHTTPRequestHandler):
    """Serves the front-end files and forwards API calls to the Python backend."""

    def log_message(self, *args):
        pass

    def _proxy(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP | {"host", "content-length"}}
        try:
            conn = http.client.HTTPConnection("127.0.0.1", BACK_PORT, timeout=60)
            path = self.path[4:] if self.path.startswith("/api") else self.path
            conn.request(self.command, path or "/", body=body, headers=headers)
            resp = conn.getresponse()
            payload = resp.read()
        except OSError as exc:
            msg = f"Backend unreachable: {exc}".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        self.send_response(resp.status)
        for key, value in resp.getheaders():
            if key.lower() not in HOP_BY_HOP | {"content-length"}:
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)
        conn.close()

    def do_GET(self):
        if self.path.startswith("/api"):
            self._proxy()
        else:
            super().do_GET()

    do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _proxy


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_for_port(port, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(port):
            return True
        time.sleep(0.2)
    return False


def serve_frontend():
    handler = partial(Handler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", FRONT_PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def start_backend():
    """Launch uvicorn, unless a backend is already running on BACK_PORT."""
    if port_open(BACK_PORT):
        print(f"Backend already running on port {BACK_PORT}, reusing it.")
        return None
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.app:app",
         "--host", "127.0.0.1", "--port", str(BACK_PORT)],
        cwd=ROOT,
        creationflags=flags,
    )


def main():
    backend = start_backend()
    server = serve_frontend()
    try:
        if not wait_for_port(BACK_PORT):
            print(f"Backend never opened port {BACK_PORT}. Check the uvicorn output.")
        webview.create_window(
            "Taquin — A* 8-puzzle",
            f"http://127.0.0.1:{FRONT_PORT}/",
            width=1280,
            height=860,
            min_size=(900, 640),
            background_color="#302b25",
        )
        webview.start()
    finally:
        server.shutdown()
        if backend:
            backend.terminate()


if __name__ == "__main__":
    main()