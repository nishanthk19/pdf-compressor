import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./src/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

// 1. Clean URL 301 Redirect Middleware (Legacy .html extensions)
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    const pathname = req.path || "";
    if (pathname.endsWith(".html")) {
      const search = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      if (pathname === "/index.html") {
        return res.redirect(301, "/" + search);
      }
      const cleanPath = pathname.slice(0, -5);
      return res.redirect(301, cleanPath + search);
    }
  }
  next();
});

// 2. Serve Static Files with HTML Extension Fallback
app.use(express.static(publicDir, { extensions: ["html"] }));

// 3. CORS Setup
app.use(
  cors({
    origin: process.env.BETTER_AUTH_URL || true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// 4. Mount Better Auth Handler (MUST BE BEFORE express.json())
app.all("/api/auth/*", toNodeHandler(auth));

// 5. Body Parsers
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

// 6. Explicit Clean Page Route Handlers
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/overlay-editor", (req, res) => {
  res.sendFile(path.join(publicDir, "overlay-editor.html"));
});

app.get(["/paginate-editor", "/number", "/tools/paginate", "/tools/number"], (req, res) => {
  res.sendFile(path.join(publicDir, "paginate-editor.html"));
});

app.get("/add-text", (req, res) => {
  res.sendFile(path.join(publicDir, "tools", "add-text.html"));
});

app.get("/editor", (req, res) => {
  res.sendFile(path.join(publicDir, "editor.html"));
});

app.get("/flow-editor", (req, res) => {
  res.sendFile(path.join(publicDir, "flow-editor.html"));
});

app.get("/tools/:tool", (req, res, next) => {
  const toolName = req.params.tool;
  const toolFilePath = path.join(publicDir, "tools", `${toolName}.html`);
  if (fs.existsSync(toolFilePath)) {
    return res.sendFile(toolFilePath);
  }
  next();
});

// =========================================================================
// PDF TOOL API ROUTES PLACEHOLDER
// =========================================================================
// app.post('/compress', (req, res) => { /* PDF Compress logic */ });
// app.post('/merge', (req, res) => { /* PDF Merge logic */ });
// app.post('/rotate', (req, res) => { /* PDF Rotate logic */ });
// app.post('/delete-pages', (req, res) => { /* PDF Page Removal logic */ });
// app.post('/extract-pages', (req, res) => { /* PDF Page Extraction logic */ });
// app.post('/ocr', (req, res) => { /* PDF OCR logic */ });
// app.post('/pdf-to-word', (req, res) => { /* PDF to Docx logic */ });
// app.post('/protect', (req, res) => { /* PDF Protect logic */ });
// app.post('/unlock', (req, res) => { /* PDF Decrypt logic */ });
// app.post('/archive', (req, res) => { /* PDF/A conversion logic */ });
// app.post('/api/pdf-maker/export-pdf', (req, res) => { /* PDF Maker logic */ });
// app.post('/api/pdf-maker/export-docx', (req, res) => { /* Docx Maker logic */ });
// app.post('/paginate', (req, res) => { /* PDF Pagination logic */ });

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: err.message || "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
