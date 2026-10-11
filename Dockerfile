FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY requirements-word.txt ./
COPY requirements-letter.txt ./
ARG INSTALL_LETTER_EXTRACTOR=true

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

# Optional, isolated extraction runtime. Mount pre-fetched Docling model
# artifacts and configure LETTER_DOCLING_MODELS before enabling imports.
RUN if [ "$INSTALL_LETTER_EXTRACTOR" = "true" ]; then \
      python3 -m venv /opt/letter-venv \
      && /opt/letter-venv/bin/pip install --no-cache-dir -r requirements-letter.txt --extra-index-url https://download.pytorch.org/whl/cpu \
      && /opt/letter-venv/bin/python -c "from pathlib import Path; from docling.utils.model_downloader import download_models; download_models(output_dir=Path('/opt/letter-models'), with_code_formula=False, with_picture_classifier=False, with_rapidocr=False)"; \
    fi

RUN npm ci

COPY . .

RUN npm run build \
    && npm prune --omit=dev

# Browser is local; no hosted export or document service.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install --with-deps chromium \
    && mkdir -p /data/letters \
    && chown node:node /data/letters

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
USER node

# Apply reviewed additive migrations separately, after taking a database backup.
# Do not run schema synchronization (which can drop data) during app startup.
CMD ["node", "server.js"]
