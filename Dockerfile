FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY requirements-word.txt ./

RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript ocrmypdf qpdf python3-venv \
       tesseract-ocr-eng tesseract-ocr-hin tesseract-ocr-tam tesseract-ocr-fra \
       tesseract-ocr-deu tesseract-ocr-spa tesseract-ocr-por fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/word-venv \
    && /opt/word-venv/bin/pip install --no-cache-dir -r requirements-word.txt \
    && /opt/word-venv/bin/python -c "from pdf2docx import Converter; import pymupdf"

ENV PDF_WORD_PYTHON=/opt/word-venv/bin/python
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

RUN npm ci

COPY . .

RUN npm run build \
    && npm prune --omit=dev

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma db push && node server.js"]
