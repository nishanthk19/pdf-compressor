"""Bounded offline correspondence extraction using the existing PDF runtime."""
import json
import os
import sys
import subprocess
import zipfile
from pathlib import Path

os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
if sys.platform != 'win32':
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (800 * 1024**2, 800 * 1024**2))
    resource.setrlimit(resource.RLIMIT_CPU, (270, 270))
path = Path(sys.argv[1])
if path.stat().st_size > 20 * 1024**2:
    raise ValueError('Document too large')
with path.open('rb') as stream:
    header = stream.read(5)
parts = []
if header.startswith(b'PK'):
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist()) > 2000 or sum(i.file_size for i in archive.infolist()) > 50 * 1024**2:
            raise ValueError('Expanded document too large')
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    document = Document(path)
    for item in document.iter_inner_content():
        if isinstance(item, Paragraph):
            parts.append(item.text)
        elif isinstance(item, Table):
            parts.extend(' | '.join(cell.text for cell in row.cells) for row in item.rows)
elif header == b'%PDF-':
    import pymupdf
    with pymupdf.open(path) as document:
        if document.needs_pass or len(document) > 50:
            raise ValueError('Choose an unlocked PDF of at most 50 pages')
        for page in document:
            text = page.get_text(sort=True)
            if len(text.strip()) < 40:
                scale = min(2, 3000 / max(page.rect.width, page.rect.height))
                image = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csGRAY)
                result = subprocess.run(['tesseract', 'stdin', 'stdout', '-l', 'eng'],
                    input=image.tobytes('png'), capture_output=True, timeout=60, check=True)
                text = result.stdout.decode('utf-8', errors='replace')
            parts.append(text)
            if sum(map(len, parts)) > 250000:
                break
else:
    raise ValueError('Unsupported document')
text = '\n\n'.join(parts)[:250000]
import re
references = re.findall(r'(?im)^(?:ref(?:erence)?[.:\s]*)([^\n]{1,100})', text)[:5]
dates = re.findall(r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b', text)[:10]
participants = re.findall(r'(?im)^(?:to|from|dear)[.:\s]+([^\n]{1,150})', text)[:10]
print(json.dumps({'text': text[:250000], 'metadata': {'reviewRequired': True, 'references': references, 'dates': dates, 'participants': participants}}))
