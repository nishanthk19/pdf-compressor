import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, prisma } from "./src/auth.js";

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
const authHandler = toNodeHandler(auth);
app.all("/api/auth/*", async (req, res, next) => {
  try {
    await authHandler(req, res);
  } catch (error) {
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes("PrismaClientInitializationError") || errorMsg.includes("Can't reach database server")) {
      console.warn("[Auth API]: Database temporarily unreachable.");
    } else {
      console.error("Auth request handler error:", errorMsg);
    }
    if (!res.headersSent) {
      res.status(503).json({ error: "Database service temporarily unavailable. Please try again shortly." });
    }
  }
});

// 5. Body Parsers
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

// 6. Authentication Session Middleware for Protected API Routes
async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    }).catch((err) => {
      console.warn("Session check error (database offline):", err?.message || err);
      return null;
    });

    if (!session || !session.user) {
      return res.status(401).json({ error: "Unauthorized. Please sign in." });
    }

    req.user = session.user;
    req.session = session.session;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ error: "Unauthorized. Authentication failed." });
  }
}

// 7. Protected Processing Logs API Route
app.get("/api/logs", requireAuth, async (req, res) => {
  try {
    const logs = await prisma.processingLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(logs);
  } catch (error) {
    console.error("Failed to fetch processing logs:", error);
    res.status(500).json({ error: "Failed to retrieve logs." });
  }
});

// 8. Explicit Clean Page Route Handlers
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/profile", (req, res) => {
  res.sendFile(path.join(publicDir, "profile.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
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
// app.post('/compress', ...);
// app.post('/merge', ...);
// app.post('/rotate', ...);
// app.post('/delete-pages', ...);
// app.post('/extract-pages', ...);
// app.post('/ocr', ...);
// app.post('/pdf-to-word', ...);
// app.post('/protect', ...);
// app.post('/unlock', ...);
// app.post('/archive', ...);
// app.post('/api/pdf-maker/export-pdf', ...);
// app.post('/api/pdf-maker/export-docx', ...);
// app.post('/paginate', ...);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: err.message || "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
