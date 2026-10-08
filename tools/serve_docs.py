import http.server
import socketserver
import os
import sys

PORT = 8765
DIRECTORY = r"E:\读论文\R97"

class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), SilentHandler) as httpd:
        httpd.serve_forever()
