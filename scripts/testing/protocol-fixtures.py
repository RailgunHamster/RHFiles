"""Loopback-only disposable FTP/SFTP/WebDAV servers, never real user data."""
import base64
import json
import os
import pathlib
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse, quote
from xml.sax.saxutils import escape

import paramiko
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

ROOT = pathlib.Path(sys.argv[1]).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
USER, PASSWORD = "rhfiles-qa", "owned-fixture-only"

def local(value):
    value = unquote(urlparse(value).path)
    if value.startswith("/dav/"):
        value = value[4:]
    path = ROOT.joinpath(*pathlib.PurePosixPath(value.lstrip("/")).parts).resolve()
    if path != ROOT and ROOT not in path.parents:
        raise PermissionError("outside owned fixture")
    return path

class Dav(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *args):
        pass
    def reply(self, code, data=b"", headers=None):
        self.send_response(code)
        self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if data:
            self.wfile.write(data)
    def auth(self):
        expected = "Basic " + base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode()
        if self.headers.get("Authorization") != expected:
            self.reply(401)
            return False
        return True
    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(length)
    def do_PROPFIND(self):
        self.body()
        if not self.auth(): return
        path = local(self.path)
        if not path.is_dir(): return self.reply(404)
        responses = []
        for entry in [path, *path.iterdir()]:
            relative = entry.relative_to(ROOT).as_posix()
            href = "/dav/" + ("" if relative == "." else quote(relative)) + ("/" if entry.is_dir() and relative != "." else "")
            collection = "<d:collection/>" if entry.is_dir() else ""
            responses.append(f"<d:response><d:href>{escape(href)}</d:href><d:propstat><d:prop><d:resourcetype>{collection}</d:resourcetype><d:getcontentlength>{entry.stat().st_size}</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>")
        self.reply(207, ('<d:multistatus xmlns:d="DAV:">' + "".join(responses) + "</d:multistatus>").encode(), {"Content-Type": "application/xml; charset=utf-8"})
    def do_MKCOL(self):
        if not self.auth(): return
        try: local(self.path).mkdir()
        except FileExistsError: return self.reply(405)
        self.reply(201)
    def do_DELETE(self):
        if not self.auth(): return
        path = local(self.path)
        try:
            path.rmdir() if path.is_dir() else path.unlink()
        except FileNotFoundError: return self.reply(404)
        self.reply(204)
    def do_MOVE(self):
        if not self.auth(): return
        source, dest = local(self.path), local(self.headers["Destination"])
        if dest.exists(): return self.reply(412)
        source.rename(dest)
        self.reply(201)
    def do_GET(self):
        if not self.auth(): return
        try: data = local(self.path).read_bytes()
        except FileNotFoundError: return self.reply(404)
        self.reply(200, data)
    def do_PUT(self):
        data = self.body()
        if not self.auth(): return
        try:
            with local(self.path).open("xb") as file: file.write(data)
        except FileExistsError: return self.reply(412)
        self.reply(201)

class Auth(paramiko.ServerInterface):
    def check_auth_password(self, username, password):
        return paramiko.AUTH_SUCCESSFUL if (username, password) == (USER, PASSWORD) else paramiko.AUTH_FAILED
    def get_allowed_auths(self, username): return "password"
    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_SUCCEEDED if kind == "session" else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

class Sftp(paramiko.SFTPServerInterface):
    def list_folder(self, path):
        try:
            result = []
            for entry in local(path).iterdir():
                attr = paramiko.SFTPAttributes.from_stat(entry.stat())
                attr.filename = entry.name
                result.append(attr)
            return result
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def stat(self, path):
        try: return paramiko.SFTPAttributes.from_stat(local(path).stat())
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    lstat = stat
    def open(self, path, flags, attr):
        try:
            fd = os.open(local(path), flags | getattr(os, "O_BINARY", 0), 0o600)
            mode = "r+b" if flags & os.O_RDWR else "wb" if flags & os.O_WRONLY else "rb"
            stream = os.fdopen(fd, mode)
            handle = paramiko.SFTPHandle(flags)
            if flags & (os.O_WRONLY | os.O_RDWR): handle.writefile = stream
            if not flags & os.O_WRONLY: handle.readfile = stream
            return handle
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def remove(self, path):
        try: local(path).unlink(); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def mkdir(self, path, attr):
        try: local(path).mkdir(); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def rmdir(self, path):
        try: local(path).rmdir(); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def rename(self, old, new):
        try:
            if local(new).exists(): return paramiko.SFTP_FAILURE
            local(old).rename(local(new)); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)

key = paramiko.RSAKey.generate(2048)
ssh = socket.socket()
ssh.bind(("127.0.0.1", 0)); ssh.listen(20)
def handle_ssh(connection):
    transport = paramiko.Transport(connection)
    # This fixture has no OpenSSH moduli database. Remove GEX before KEXINIT;
    # Paramiko 5.1 otherwise advertises its pre-filter list but chooses from the
    # post-filter list, producing different client/server negotiated algorithms.
    options = transport.get_security_options()
    options.kex = tuple(k for k in options.kex if not k.startswith("diffie-hellman-group-exchange-"))
    transport.add_server_key(key)
    transport.set_subsystem_handler("sftp", paramiko.SFTPServer, Sftp)
    try: transport.start_server(server=Auth())
    except Exception: transport.close()
def accept_ssh():
    while True:
        connection, _ = ssh.accept()
        threading.Thread(target=handle_ssh, args=(connection,), daemon=True).start()
threading.Thread(target=accept_ssh, daemon=True).start()

authorizer = DummyAuthorizer(); authorizer.add_user(USER, PASSWORD, str(ROOT), perm="elradfmwMT")
class Ftp(FTPHandler): pass
Ftp.authorizer = authorizer
ftp = FTPServer(("127.0.0.1", 0), Ftp)
threading.Thread(target=ftp.serve_forever, kwargs={"timeout": 0.2}, daemon=True).start()
dav = ThreadingHTTPServer(("127.0.0.1", 0), Dav)
threading.Thread(target=dav.serve_forever, daemon=True).start()
print(json.dumps({"sftp": ssh.getsockname()[1], "ftp": ftp.socket.getsockname()[1], "webdav": dav.server_address[1]}), flush=True)
sys.stdin.read()
