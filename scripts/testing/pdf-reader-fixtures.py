"""Synthetic documents only. Never reads the user's PDF collection."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from pypdf import PdfReader, PdfWriter
import random, sys

root = Path(sys.argv[1] if len(sys.argv)>1 else 'test-artifacts/pdf-reader-fixtures')
root.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
source=BytesIO()
c=canvas.Canvas(source, pagesize=(595,842), invariant=1)
for page in range(1,4):
    c.setFillColorRGB(.1,.25,.42);c.roundRect(36,706,523,96,12,fill=1,stroke=0)
    c.setFillColorRGB(1,1,1);c.setFont('Helvetica-Bold',24);c.drawString(56,760,'RHFiles PDF Reader')
    c.setFont('Helvetica',14);c.drawString(56,733,f'Synthetic acceptance document - page {page}')
    c.setFillColorRGB(.15,.2,.3);c.setFont('STSong-Light',20);c.drawString(48,656,'中文阅读测试：文件、网络、目录与搜索')
    c.setFont('Helvetica',16);c.drawString(48,606,f'Findable token: needle-{page}')
    c.setFont('Helvetica',12);c.drawString(48,570,'Only generated data. No personal files or database.')
    c.setStrokeColorRGB(.2,.55,.7);c.rect(48,270,499,240,fill=0)
    c.bookmarkPage(f'page-{page}');c.addOutlineEntry(f'Chapter {page}',f'page-{page}',0)
    c.showPage()
c.save()
root.joinpath('normal.pdf').write_bytes(source.getvalue())
writer=PdfWriter();writer.clone_document_from_reader(PdfReader(BytesIO(source.getvalue())))
writer.encrypt('qa-reader',algorithm='AES-256');writer.write(root/'encrypted.pdf')
writer=PdfWriter();page=PdfReader(BytesIO(source.getvalue())).pages[0]
for _ in range(500): writer.add_page(page)
writer.add_attachment('unopened-test-padding.bin',random.Random(20261110).randbytes(20*1024*1024))
writer.write(root/'large.pdf')
writer=PdfWriter();writer.add_page(PdfReader(BytesIO(source.getvalue())).pages[0]);writer.pages[0].rotate(90);writer.write(root/'rotated.pdf')
for name in ['normal.pdf','encrypted.pdf','large.pdf','rotated.pdf']:
    document=PdfReader(root/name)
    if document.is_encrypted: assert document.decrypt('qa-reader')
    assert 'needle-1' in document.pages[0].extract_text()
    print(name,root.joinpath(name).stat().st_size,len(document.pages))
