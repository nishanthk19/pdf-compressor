import dns from "dns/promises";
import net from "net";

function isPrivateAddress(address) {
    if (net.isIPv4(address)) {
        const [a, b] = address.split(".").map(Number);
        return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function assertSafeEndpoint(rawUrl) {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Custom AI endpoints must use HTTPS without embedded credentials.");
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local AI endpoints are not available from the hosted service.");
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Private-network AI endpoints are not allowed.");
    return url.toString();
}

function draftingPrompt(input) {
    return `Create an Editor.js document draft. Return JSON only with this shape: {"headerTitle":"string","headerSubtitle":"string","footerLeft":"string","footerRight":"string","blocks":[{"type":"header|paragraph|list|quote|table","data":{}}]}. Use valid Editor.js block data. Tone: ${input.tone || "Professional"}. Action: ${input.action || "draft"}. User request: ${input.prompt || "Draft from the attached context"}. Existing blocks: ${JSON.stringify(input.currentContent || []).slice(0, 30000)}`;
}

function parseDraft(text) {
    const cleaned = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || !Array.isArray(parsed.blocks)) throw new Error("The AI provider returned an invalid document draft.");
    return parsed;
}

async function postJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.error || `AI provider request failed (${response.status}).`);
    return data;
}

export async function generateDraft(input) {
    const provider = String(input.provider || "google").toLowerCase();
    if (!["google", "openai", "anthropic", "deepseek", "custom"].includes(provider)) throw new Error("Unsupported AI provider.");
    const prompt = draftingPrompt(input);

    if (provider === "google") {
        const apiKey = input.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("A Gemini API key is required.");
        const model = input.modelTier === "complex" ? (process.env.GEMINI_COMPLEX_MODEL || "gemini-3.6-flash") : (process.env.GEMINI_MODEL || "gemini-3.6-flash");
        const parts = [{ text: prompt }];
        if (input.fileBase64 && input.fileMimeType) parts.push({ inline_data: { mime_type: input.fileMimeType, data: input.fileBase64 } });
        const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }),
        });
        return { draft: parseDraft(data.candidates?.[0]?.content?.parts?.[0]?.text), modelUsed: model };
    }

    if (provider === "anthropic") {
        const apiKey = input.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("An Anthropic API key is required.");
        const model = input.modelTier === "complex" ? (process.env.ANTHROPIC_COMPLEX_MODEL || "claude-sonnet-4-5") : (process.env.ANTHROPIC_MODEL || "claude-haiku-4-5");
        const data = await postJson("https://api.anthropic.com/v1/messages", {
            method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
        });
        return { draft: parseDraft(data.content?.[0]?.text), modelUsed: model };
    }

    const apiKey = input.apiKey || (provider === "openai" ? process.env.OPENAI_API_KEY : provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : "");
    if (!apiKey) throw new Error("An API key is required for this provider.");
    const endpoint = provider === "custom" ? await assertSafeEndpoint(input.customEndpoint) : provider === "deepseek" ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const model = provider === "deepseek" ? (input.modelTier === "complex" ? "deepseek-reasoner" : "deepseek-chat") : provider === "custom" ? (input.model || process.env.CUSTOM_AI_MODEL || "default") : (input.modelTier === "complex" ? (process.env.OPENAI_COMPLEX_MODEL || "gpt-5.2") : (process.env.OPENAI_MODEL || "gpt-5-mini"));
    const data = await postJson(endpoint, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    return { draft: parseDraft(data.choices?.[0]?.message?.content), modelUsed: model };
}
