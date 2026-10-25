import socket
import threading
import webbrowser

from dsl_crud.application import app
from dsl_crud.infrastructure import exports

PORT = 8766


def _running() -> bool:
    with socket.socket() as connection:
        return connection.connect_ex(("127.0.0.1", PORT)) == 0


def main() -> None:
    url = f"http://127.0.0.1:{PORT}"
    if _running():
        webbrowser.open(url)
        return
    threading.Timer(0.8, webbrowser.open, args=(url,)).start()
    exports.start()
    app.run(port=PORT)


if __name__ == "__main__":
    main()
