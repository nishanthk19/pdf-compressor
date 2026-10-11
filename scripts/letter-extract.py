"""Bounded local Docling extraction. Provision models before enabling uploads."""
import json
import logging
import os
import sys
import zipfile
from pathlib import Path

logging.disable(logging.CRITICAL)
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
if sys.platform != 'win32':
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (3 * 1024**3, 3 * 1024**3))
    resource.setrlimit(resource.RLIMIT_CPU, (270, 270))
path = Path(sys.argv[1])
with path.open('rb') as stream:
    header = stream.read(5)
if header.startswith(b'PK'):
    with zipfile.ZipFile(path) as archive:
        if sum(i.file_size for i in archive.infolist()) > 50 * 1024**2:
            raise ValueError('Expanded document too large')
elif header != b'%PDF-':
    raise ValueError('Unsupported document')
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TesseractCliOcrOptions
options = PdfPipelineOptions()
options.enable_remote_services = False
options.do_ocr = True
options.ocr_options = TesseractCliOcrOptions(lang=['eng'])
options.artifacts_path = Path(os.environ['LETTER_DOCLING_MODELS'])
converter = DocumentConverter(allowed_formats=[InputFormat.PDF, InputFormat.DOCX], format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
result = converter.convert(path, max_num_pages=50, max_file_size=20 * 1024**2)
text = result.document.export_to_markdown()
import re
references = re.findall(r'(?im)^(?:ref(?:erence)?[.:\s]*)([^\n]{1,100})', text)[:5]
dates = re.findall(r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b', text)[:10]
participants = re.findall(r'(?im)^(?:to|from|dear)[.:\s]+([^\n]{1,150})', text)[:10]
print(json.dumps({'text': text[:250000], 'metadata': {'reviewRequired': True, 'references': references, 'dates': dates, 'participants': participants}}))
