import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).with_name("webapp")


class WebAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


def main() -> None:
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), WebAppHandler)
    print(f"WebApp server running on 0.0.0.0:{port} serving {ROOT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
