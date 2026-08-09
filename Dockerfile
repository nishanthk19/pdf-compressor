FROM node:20-bullseye-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ghostscript python3 python3-pip && \
    RUN pip3 install PyMuPDF==1.23.26 pdf2docx && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
