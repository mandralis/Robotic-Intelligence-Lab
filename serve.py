"""Preview the lab site:  python3 serve.py   (optional: python3 serve.py 4001)"""
import functools, http.server, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # refresh always shows the latest edit
        super().end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(("", PORT), functools.partial(Handler, directory=ROOT)) as httpd:
    print(f"\n  Mandralis Lab:  http://localhost:{PORT}/\n\n  (Cmd-click the link to open it; Ctrl-C to stop)\n", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
