FROM node:20-bullseye-slim

# Install OS dependencies
RUN apt-get update && apt-get install -y \
    ghostscript \
    python3 \
    python3-pip \
    ocrmypdf \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install PyMuPDF==1.23.26 pdf2docx

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
