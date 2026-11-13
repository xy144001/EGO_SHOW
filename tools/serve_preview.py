"""Local static preview with byte ranges for native video seeking."""
import argparse, functools, re
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.remaining=None
        path=Path(self.translate_path(self.path))
        header=self.headers.get('Range')
        if not header or not path.is_file():return super().send_head()
        size=path.stat().st_size;match=re.fullmatch(r'bytes=(\d*)-(\d*)',header)
        if not match or not any(match.groups()):self.send_error(416);return None
        a,b=match.groups()
        start=int(a) if a else max(0,size-int(b));end=min(int(b),size-1) if a and b else size-1
        if start>=size or end<start:
            self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.end_headers();return None
        f=path.open('rb');f.seek(start);self.remaining=end-start+1
        self.send_response(206);self.send_header('Content-Type',self.guess_type(str(path)))
        self.send_header('Content-Length',str(self.remaining));self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.send_header('Accept-Ranges','bytes');self.end_headers();return f
    def copyfile(self,source,output):
        if self.remaining is None:return super().copyfile(source,output)
        while self.remaining:
            buf=source.read(min(self.remaining,256*1024))
            if not buf:break
            output.write(buf);self.remaining-=len(buf)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--directory',type=Path,default=Path(__file__).resolve().parents[1]);a=p.parse_args()
    ThreadingHTTPServer(('127.0.0.1',a.port),functools.partial(Handler,directory=str(a.directory))).serve_forever()
