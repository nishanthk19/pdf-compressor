import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./src/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();
const publicDir = path.join(__dirname, "public");

// 1. Trust proxy (Required for Coolify / Traefik reverse proxy)
app.set("trust proxy", true);

// 2. Mount Better Auth Handler (MUST be mounted before express.json() / body parsers)
app.all("/api/auth/*", toNodeHandler(auth));

// 3. Body parsers
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

// 4. Static frontend files (with clean HTML extensions fallback)
app.use(express.static(publicDir, { extensions: ["html"] }));

// --- Admin Security Middleware ---
const requireAdmin = async (req, res, next) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });
        if (!session || !session.user) {
            return res.status(401).json({ error: "Unauthorized: Please log in." });
        }

        req.user = session.user;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        res.status(401).json({ error: "Authentication failed" });
    }
};

// --- Admin Database Management Endpoints ---

// Get all database records & stats
app.get("/api/admin/data", requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            include: { accounts: true, sessions: true },
            orderBy: { createdAt: "desc" }
        });
        const processingLogs = await prisma.processingLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 50
        }).catch(() => []); // Fallback if table doesn't exist yet

        res.json({ users, processingLogs });
    } catch (error) {
        console.error("Admin data fetch error:", error);
        res.status(500).json({ error: "Failed to fetch database records" });
    }
});

// Delete a specific user and their related records
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.session.deleteMany({ where: { userId: id } });
        await prisma.account.deleteMany({ where: { userId: id } });
        await prisma.verification.deleteMany({ where: { identifier: id } }).catch(() => {});
        await prisma.user.delete({ where: { id } });

        res.json({ success: true, message: `User ${id} deleted successfully.` });
    } catch (error) {
        console.error("User deletion error:", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// Wipe all database records (Truncate equivalent)
app.post("/api/admin/wipe", requireAdmin, async (req, res) => {
    try {
        await prisma.processingLog.deleteMany({}).catch(() => {});
        await prisma.session.deleteMany({});
        await prisma.account.deleteMany({});
        await prisma.verification.deleteMany({}).catch(() => {});
        await prisma.user.deleteMany({});

        res.json({ success: true, message: "All database records wiped successfully." });
    } catch (error) {
        console.error("Wipe DB error:", error);
        res.status(500).json({ error: "Failed to wipe database" });
    }
});

// Explicit Clean Page Route Handlers
app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/profile", (req, res) => {
    res.sendFile(path.join(publicDir, "profile.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

// Explicit Add-Text Alias
app.get(["/add-text", "/tools/add-text"], (req, res) => {
    res.sendFile(path.join(publicDir, "tools", "add-text.html"));
});

// Fallback for tools and HTML pages
app.get("/tools/:tool", (req, res, next) => {
    const toolName = req.params.tool;
    const toolFilePath = path.join(publicDir, "tools", `${toolName}.html`);
    if (fs.existsSync(toolFilePath)) {
        return res.sendFile(toolFilePath);
    }
    next();
});

// Fallback to index.html for SPA/dynamic routes
app.get("*", (req, res) => {
    const directFile = path.join(publicDir, req.path);
    if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
        return res.sendFile(directFile);
    }
    const htmlFile = path.join(publicDir, `${req.path}.html`);
    if (fs.existsSync(htmlFile)) {
        return res.sendFile(htmlFile);
    }
    // Also check tools directory for direct names like /compress, /merge, /ocr, etc.
    const cleanPath = req.path.replace(/^\//, "").replace(/\/$/, "");
    const toolFile = path.join(publicDir, "tools", `${cleanPath}.html`);
    if (fs.existsSync(toolFile)) {
        return res.sendFile(toolFile);
    }
    res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});