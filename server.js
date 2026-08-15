const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const { GoogleGenAI, Type } = require('@google/genai');
const pdfHelpers = require('./pdf-helpers');

const app = express();
const PORT = process.env.PORT || 3000;

// Storage directories
const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Multer Disk Storage Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeExt = path.extname(file.originalname) || '.pdf';
    cb(null, 'file_' + uniqueSuffix + safeExt);
  }
});

const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// Clean URL Middleware: Redirect requests with .html extension to clean URLs
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const pathname = req.path || '';
    if (pathname.endsWith('.html')) {
      const search = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      if (pathname === '/index.html') {
        return res.redirect(301, '/' + search);
      }
      const cleanPath = pathname.slice(0, -5);
      return res.redirect(301, cleanPath + search);
    }
  }
  next();
});

app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(publicDir, { extensions: ['html'] }));

// ==========================================
// HELPER: SAFE & REPAIRING JSON PARSING
// ==========================================
function cleanAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  let text = rawText.trim();
  // Strip markdown code fence if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  try {
    return JSON.parse(text);
  } catch (err1) {
    // Sanitize unescaped control characters inside strings
    const sanitized = text.replace(/[\u0000-\u001F]+/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });

    try {
      return JSON.parse(sanitized);
    } catch (err2) {
      // Smart repair for truncated JSON string literals and unclosed brackets
      let inString = false;
      let escaped = false;
      let openBrackets = [];

      for (let i = 0; i < sanitized.length; i++) {
        const char = sanitized[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{' || char === '[') {
            openBrackets.push(char);
          } else if (char === '}' || char === ']') {
            openBrackets.pop();
          }
        }
      }

      let repaired = sanitized;
      if (inString) {
        repaired += '"';
      }

      for (let i = openBrackets.length - 1; i >= 0; i--) {
        const b = openBrackets[i];
        if (b === '{') repaired += '}';
        if (b === '[') repaired += ']';
      }

      try {
        return JSON.parse(repaired);
      } catch (err3) {
        // Fallback: locate last valid closing brace
        const lastCurly = sanitized.lastIndexOf('}');
        if (lastCurly > 0) {
          try {
            return JSON.parse(sanitized.substring(0, lastCurly + 1));
          } catch (e4) {
            try {
              return JSON.parse(sanitized.substring(0, lastCurly + 1) + ']}');
            } catch (e5) {
              // ignore
            }
          }
        }
        throw err1;
      }
    }
  }
}

// ==========================================
// ==========================================
// BYOK MULTI-LLM DOCUMENT DRAFTING API (/api/gemini/draft & /api/ai/draft)
// Supports Google Gemini, OpenAI, Anthropic Claude, DeepSeek & Custom OpenAI-compatible APIs
// ==========================================
async function runGeminiDraftRequest({ userApiKey, requestedModel, useThinking, modelTier, fileBase64, fileMimeType, userPromptText, systemInstruction }) {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API Key is missing. Please enter your BYOK key or configure GEMINI_API_KEY in server secrets.');
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  const candidateModels = [];
  if (requestedModel) {
    candidateModels.push({ model: requestedModel, thinking: useThinking });
  }
  if (useThinking || modelTier === 'complex') {
    candidateModels.push({ model: 'gemini-3.1-pro-preview', thinking: true });
    candidateModels.push({ model: 'gemini-3.6-flash', thinking: false });
    candidateModels.push({ model: 'gemini-3.5-flash', thinking: false });
    candidateModels.push({ model: 'gemini-3.1-flash-lite', thinking: false });
  } else if (modelTier === 'fast') {
    candidateModels.push({ model: 'gemini-3.1-flash-lite', thinking: false });
    candidateModels.push({ model: 'gemini-3.6-flash', thinking: false });
    candidateModels.push({ model: 'gemini-3.5-flash', thinking: false });
  } else {
    candidateModels.push({ model: 'gemini-3.5-flash', thinking: false });
    candidateModels.push({ model: 'gemini-3.6-flash', thinking: false });
    candidateModels.push({ model: 'gemini-3.1-flash-lite', thinking: false });
  }

  const contentsArray = [];
  if (fileBase64) {
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    contentsArray.push({
      inlineData: {
        data: cleanBase64,
        mimeType: fileMimeType || 'image/png'
      }
    });
  }
  contentsArray.push({ text: userPromptText });

  let parsedData = null;
  let successfulModel = '';
  let usedThinking = false;
  let lastError = null;

  for (const candidate of candidateModels) {
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        const generateConfig = {
          systemInstruction,
          responseMimeType: 'application/json'
        };
        if (candidate.thinking) {
          generateConfig.thinkingConfig = { thinkingLevel: 'HIGH' };
        }

        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: contentsArray.length === 1 ? contentsArray[0].text : { parts: contentsArray },
          config: generateConfig
        });

        const responseText = response.text;
        if (responseText) {
          parsedData = cleanAndParseJSON(responseText);
          if (parsedData && parsedData.headerTitle && Array.isArray(parsedData.blocks)) {
            successfulModel = candidate.model;
            usedThinking = candidate.thinking;
            break;
          }
        }
      } catch (candidateErr) {
        const errStr = candidateErr.message || String(candidateErr);
        console.warn(`[Gemini BYOK] Candidate ${candidate.model} failed:`, errStr);
        lastError = candidateErr;
        if (attempts < 2 && (errStr.includes('503') || errStr.includes('429'))) {
          await new Promise(r => setTimeout(r, 800));
        } else {
          break;
        }
      }
    }
    if (parsedData) break;
  }

  if (!parsedData && lastError) {
    throw new Error(`Gemini Error: ${lastError.message || lastError}`);
  }

  return { parsedData, successfulModel, usedThinking };
}

const handleAiDraftRequest = async (req, res) => {
  try {
    const { 
      provider = 'google', // 'google' | 'openai' | 'anthropic' | 'deepseek' | 'custom'
      apiKey: userApiKey,
      customEndpoint,
      model: requestedModel,
      prompt, 
      action = 'draft', 
      tone = 'Professional', 
      currentContent = '', 
      fileBase64, 
      fileMimeType,
      modelTier = 'general', // 'fast', 'general', 'complex'
      useThinking = false
    } = req.body;

    if (!prompt && !fileBase64 && !currentContent) {
      return res.status(400).json({ error: 'Please provide a document prompt, existing text, or uploaded document image.' });
    }

    const systemInstruction = `You are an expert document drafting and AI intelligence assistant for Vibify PDF Maker.
Your task is to draft, structure, analyze, outline, expand, or refine professional documents.
You must return your output strictly in JSON format matching the schema provided.

Rules for Editor.js blocks output:
1. 'blocks' is an array of Editor.js formatted content blocks.
2. Allowed block types:
   - 'header': data has 'text' (string with HTML tags like <strong>) and 'level' (1, 2, or 3).
   - 'paragraph': data has 'text' (string with HTML tags like <strong>, <em>, <br>, <a href="...">).
   - 'list': data has 'style' ('unordered' or 'ordered') and 'items' (array of strings).
   - 'checklist': data has 'items' (array of strings or objects {text: string, checked: boolean}).
   - 'table': data has 'content' (2D array of strings where first row represents column headers).
   - 'quote': data has 'text' (string) and 'caption' (string).
   - 'warning': data has 'title' (string) and 'message' (string).
   - 'code': data has 'code' (string).
   - 'delimiter': data is an empty object {}.
3. Produce well-written, realistic, comprehensive, and professional text without placeholders like "[Insert Date]". Fill in realistic representative values unless guided otherwise.
4. Provide appropriate 'headerTitle' (e.g., 'NON-DISCLOSURE AGREEMENT'), 'headerSubtitle' (e.g., 'Ref: #2026-NDA • August 2026'), 'footerLeft' (e.g. 'Confidential & Proprietary'), and 'footerRight' (e.g. 'Page 1 of 1').

Required Output JSON Schema Structure:
{
  "headerTitle": "Document Title",
  "headerSubtitle": "Subheader or Date",
  "footerLeft": "Footer Left Note",
  "footerRight": "Footer Right Note",
  "summary": "Brief 1-2 sentence overview",
  "analysisNotes": ["Key point 1", "Key point 2"],
  "blocks": [
    { "type": "header", "data": { "text": "Heading text", "level": 1 } },
    { "type": "paragraph", "data": { "text": "Paragraph text..." } }
  ]
}`;

    let userPromptText = `Document Action: ${action.toUpperCase()}\nRequested Tone/Style: ${tone}\nUser Instruction / Topic: ${prompt || 'Draft a formal, comprehensive document.'}`;

    if (currentContent) {
      const currentStr = typeof currentContent === 'string' ? currentContent : JSON.stringify(currentContent);
      userPromptText += `\n\nExisting Canvas Content:\n${currentStr.substring(0, 3000)}`;
    }

    let parsedData = null;
    let successfulModel = '';
    let usedThinking = false;
    let usedProvider = provider;
    let fallbackNotice = null;

    // ==================== PROVIDER 1: GOOGLE GEMINI ====================
    if (provider === 'google') {
      try {
        const result = await runGeminiDraftRequest({
          userApiKey, requestedModel, useThinking, modelTier, fileBase64, fileMimeType, userPromptText, systemInstruction
        });
        parsedData = result.parsedData;
        successfulModel = result.successfulModel;
        usedThinking = result.usedThinking;
      } catch (geminiErr) {
        return res.status(400).json({ error: geminiErr.message || 'Gemini API call failed.' });
      }
    }

    // ==================== NON-GOOGLE PROVIDERS WITH AUTO-FALLBACK ====================
    else {
      let providerErrMessage = '';

      try {
        // --- OpenAI ---
        if (provider === 'openai') {
          const apiKey = userApiKey || process.env.OPENAI_API_KEY;
          if (!apiKey) throw new Error('OpenAI API Key is missing. Please enter your OpenAI BYOK key.');

          const targetModel = requestedModel || (useThinking ? 'o3-mini' : (modelTier === 'fast' ? 'gpt-4o-mini' : 'gpt-4o'));
          const requestPayload = {
            model: targetModel,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: userPromptText }
            ],
            response_format: { type: 'json_object' }
          };

          const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestPayload)
          });

          const openAiJson = await openAiRes.json();
          if (!openAiRes.ok) {
            throw new Error(openAiJson.error?.message || `OpenAI API returned HTTP ${openAiRes.status}`);
          }

          const replyText = openAiJson.choices?.[0]?.message?.content;
          parsedData = cleanAndParseJSON(replyText);
          successfulModel = targetModel;
          usedThinking = useThinking || targetModel.includes('o3') || targetModel.includes('o1');
        }

        // --- Anthropic Claude ---
        else if (provider === 'anthropic') {
          const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY;
          if (!apiKey) throw new Error('Anthropic API Key is missing. Please enter your Anthropic BYOK key.');

          const targetModel = requestedModel || (modelTier === 'fast' ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022');
          const requestPayload = {
            model: targetModel,
            max_tokens: 4096,
            system: systemInstruction,
            messages: [{ role: 'user', content: userPromptText }]
          };

          const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestPayload)
          });

          const claudeJson = await claudeRes.json();
          if (!claudeRes.ok) {
            throw new Error(claudeJson.error?.message || `Anthropic API returned HTTP ${claudeRes.status}`);
          }

          const replyText = claudeJson.content?.[0]?.text;
          parsedData = cleanAndParseJSON(replyText);
          successfulModel = targetModel;
        }

        // --- DeepSeek ---
        else if (provider === 'deepseek') {
          const apiKey = userApiKey || process.env.DEEPSEEK_API_KEY;
          if (!apiKey) throw new Error('DeepSeek API Key is missing. Please enter your DeepSeek BYOK key.');

          const targetModel = requestedModel || (useThinking || modelTier === 'complex' ? 'deepseek-reasoner' : 'deepseek-chat');

          const deepseekRes = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: targetModel,
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userPromptText }
              ],
              response_format: { type: 'json_object' }
            })
          });

          const deepseekJson = await deepseekRes.json();
          if (!deepseekRes.ok) {
            throw new Error(deepseekJson.error?.message || `DeepSeek API returned HTTP ${deepseekRes.status}`);
          }

          const replyText = deepseekJson.choices?.[0]?.message?.content;
          parsedData = cleanAndParseJSON(replyText);
          successfulModel = targetModel;
          usedThinking = targetModel.includes('reasoner');
        }

        // --- Custom OpenAI-Compatible API ---
        else if (provider === 'custom') {
          if (!customEndpoint) throw new Error('Custom API Base URL endpoint is required (e.g. https://api.groq.com/openai/v1 or http://localhost:11434/v1).');

          let targetUrl = customEndpoint.trim();
          if (!targetUrl.endsWith('/chat/completions')) {
            targetUrl = targetUrl.replace(/\/$/, '') + '/chat/completions';
          }

          const targetModel = requestedModel || 'default-model';
          const headers = { 'Content-Type': 'application/json' };
          if (userApiKey) {
            headers['Authorization'] = `Bearer ${userApiKey}`;
          }

          const customRes = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: targetModel,
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userPromptText }
              ]
            })
          });

          const customJson = await customRes.json();
          if (!customRes.ok) {
            throw new Error(customJson.error?.message || customJson.message || `Custom API returned HTTP ${customRes.status}`);
          }

          const replyText = customJson.choices?.[0]?.message?.content || JSON.stringify(customJson);
          parsedData = cleanAndParseJSON(replyText);
          successfulModel = targetModel;
        }

      } catch (err) {
        providerErrMessage = err.message || String(err);
        console.warn(`[AI Draft] Provider ${provider} failed: ${providerErrMessage}`);

        // Try automatic fallback to Google Gemini
        if (process.env.GEMINI_API_KEY || userApiKey) {
          try {
            console.log(`[AI Draft] Attempting automatic fallback to Google Gemini...`);
            const fallbackRes = await runGeminiDraftRequest({
              userApiKey: process.env.GEMINI_API_KEY ? '' : userApiKey,
              requestedModel: null,
              useThinking,
              modelTier,
              fileBase64,
              fileMimeType,
              userPromptText,
              systemInstruction
            });

            parsedData = fallbackRes.parsedData;
            successfulModel = `${fallbackRes.successfulModel} (Fallback from ${provider.toUpperCase()})`;
            usedThinking = fallbackRes.usedThinking;
            usedProvider = 'google';
            fallbackNotice = `Note: ${provider.toUpperCase()} failed (${providerErrMessage}). Drafted using Google Gemini.`;
          } catch (fallbackErr) {
            console.error(`[AI Draft] Fallback to Gemini also failed:`, fallbackErr.message);
          }
        }
      }

      if (!parsedData) {
        return res.status(400).json({
          error: `${provider.toUpperCase()} API Error: ${providerErrMessage}. You can switch provider to Google Gemini (built-in) or update your BYOK API key.`
        });
      }
    }

    // Post-process blocks for Editor.js compatibility
    if (parsedData.blocks && Array.isArray(parsedData.blocks)) {
      parsedData.blocks = parsedData.blocks.map(b => {
        if (!b || typeof b !== 'object') return null;
        let blockType = (b.type || 'paragraph').toLowerCase();
        let blockData = b.data || {};

        if (blockType === 'header') {
          if (typeof blockData.text !== 'string') blockData.text = 'Section Title';
          blockData.level = Math.min(3, Math.max(1, parseInt(blockData.level) || 2));
        } else if (blockType === 'paragraph') {
          if (typeof blockData.text !== 'string') blockData.text = String(blockData.text || '');
        } else if (blockType === 'list') {
          if (!Array.isArray(blockData.items)) blockData.items = [String(blockData.text || 'Item')];
          blockData.style = blockData.style === 'ordered' ? 'ordered' : 'unordered';
        } else if (blockType === 'checklist') {
          if (!Array.isArray(blockData.items)) blockData.items = [];
          blockData.items = blockData.items.map(i => {
            if (typeof i === 'string') return { text: i, checked: false };
            return { text: i.text || '', checked: Boolean(i.checked) };
          });
        } else if (blockType === 'table') {
          if (!Array.isArray(blockData.content)) {
            blockData.content = [['Header 1', 'Header 2'], ['Value 1', 'Value 2']];
          }
        } else if (blockType === 'quote') {
          if (typeof blockData.text !== 'string') blockData.text = '';
          if (typeof blockData.caption !== 'string') blockData.caption = '';
        } else if (blockType === 'warning') {
          if (typeof blockData.title !== 'string') blockData.title = 'Notice';
          if (typeof blockData.message !== 'string') blockData.message = '';
        } else if (blockType === 'code') {
          if (typeof blockData.code !== 'string') blockData.code = '';
        }

        return { type: blockType, data: blockData };
      }).filter(Boolean);
    }

    res.json({ 
      success: true, 
      provider: usedProvider,
      modelUsed: successfulModel, 
      thinkingMode: usedThinking,
      fallbackNotice,
      draft: parsedData 
    });
  } catch (err) {
    console.error('AI Draft Error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate document draft.' });
  }
};

app.post('/api/gemini/draft', handleAiDraftRequest);
app.post('/api/ai/draft', handleAiDraftRequest);

// Helper for aggressive file deletion using fs.unlinkSync
function safeUnlinkSync(filePaths) {
  if (!filePaths) return;
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  paths.forEach(filePath => {
    if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err.message);
      }
    }
  });
}

// Serve SPA & SEO endpoints
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/overlay-editor', (req, res) => {
  res.sendFile(path.join(publicDir, 'overlay-editor.html'));
});

app.get(['/paginate-editor', '/number', '/tools/paginate', '/tools/number'], (req, res) => {
  res.sendFile(path.join(publicDir, 'paginate-editor.html'));
});

app.get('/add-text', (req, res) => {
  res.sendFile(path.join(publicDir, 'tools', 'add-text.html'));
});

app.get('/editor', (req, res) => {
  res.sendFile(path.join(publicDir, 'editor.html'));
});

app.get('/flow-editor', (req, res) => {
  res.sendFile(path.join(publicDir, 'flow-editor.html'));
});

app.get('/tools/:tool', (req, res, next) => {
  const toolName = req.params.tool;
  const toolFilePath = path.join(publicDir, 'tools', `${toolName}.html`);
  if (fs.existsSync(toolFilePath)) {
    return res.sendFile(toolFilePath);
  }
  next();
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(publicDir, 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(publicDir, 'sitemap.xml'));
});

// Extract text bounding boxes for Box Precision Overlay Editor
app.post('/extract-coords', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;

    try {
      const resultData = await pdfHelpers.extractPdfCoords(inputPath);
      safeUnlinkSync(inputPath);
      res.json(resultData);
    } catch (extractErr) {
      safeUnlinkSync(inputPath);
      console.error('Extract coords error:', extractErr.message);
      res.status(500).json({ error: 'Failed to extract PDF bounding boxes.' });
    }
  });
});

// ==========================================
// 1. COMPRESS PDF (/compress)
// ==========================================
app.post('/compress', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const targetSizeMB = parseFloat(req.body.targetSize) || 2.0;
    const targetSizeBytes = targetSizeMB * 1024 * 1024;
    const tempFiles = [inputPath];

    let minDpi = 36;
    let maxDpi = 300;
    let bestOutput = null;
    let bestDiff = Infinity;
    const maxIterations = 5;

    try {
      for (let i = 0; i < maxIterations; i++) {
        const midDpi = Math.round((minDpi + maxDpi) / 2);
        const outputPath = path.join(uploadDir, `compress_${Date.now()}_iter${i}_${Math.random().toString(36).substring(2, 7)}.pdf`);
        tempFiles.push(outputPath);

        const gsCmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/default -dNOPAUSE -dQUIET -dBATCH \
-dDownsampleColorImages=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=${midDpi} \
-dDownsampleGrayImages=true -dGrayImageDownsampleType=/Bicubic -dGrayImageResolution=${midDpi} \
-dDownsampleMonoImages=true -dMonoImageDownsampleType=/Bicubic -dMonoImageResolution=${midDpi} \
-sOutputFile="${outputPath}" "${inputPath}"`;

        execSync(gsCmd);

        if (fs.existsSync(outputPath)) {
          const currentSize = fs.statSync(outputPath).size;
          const diff = Math.abs(currentSize - targetSizeBytes);

          if (diff < bestDiff || !bestOutput) {
            bestDiff = diff;
            bestOutput = outputPath;
          }

          if (diff / targetSizeBytes <= 0.05) {
            break;
          }

          if (currentSize > targetSizeBytes) {
            maxDpi = midDpi - 1;
          } else {
            minDpi = midDpi + 1;
          }

          if (minDpi > maxDpi) {
            break;
          }
        }
      }

      if (!bestOutput || !fs.existsSync(bestOutput)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Failed to compress PDF using Ghostscript.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_compressed_${targetSizeMB}MB.pdf`;

      res.download(bestOutput, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving compressed file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (error) {
      console.error('Compression error:', error.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to compress PDF.' });
    }
  });
});

// ==========================================
// 2. MERGE PDFs (/merge)
// ==========================================
app.post('/merge', (req, res) => {
  upload.array('pdfs', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Files upload failed.' });
    }
    if (!req.files || req.files.length < 2) {
      if (req.files) safeUnlinkSync(req.files.map(f => f.path));
      return res.status(400).json({ error: 'Please upload at least 2 PDF files to merge.' });
    }

    const inputPaths = req.files.map(file => file.path);
    const outputPath = path.join(uploadDir, `merged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [...inputPaths, outputPath];

    try {
      const inputsQuoted = inputPaths.map(p => `"${p}"`).join(' ');
      const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" ${inputsQuoted}`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Merged PDF file was not created.' });
      }

      res.download(outputPath, 'merged_document.pdf', (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving merged file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Merge error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to merge PDFs.' });
    }
  });
});

// ==========================================
// 3. EXTRACT PAGES (/extract)
// ==========================================
app.post('/extract', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const startPage = parseInt(req.body.startPage, 10) || 1;
    const endPage = parseInt(req.body.endPage, 10) || startPage;

    if (startPage < 1 || endPage < startPage) {
      safeUnlinkSync(inputPath);
      return res.status(400).json({ error: 'Invalid page range specified.' });
    }

    const outputPath = path.join(uploadDir, `extracted_${Date.now()}_p${startPage}-${endPage}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -dFirstPage=${startPage} -dLastPage=${endPage} -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Extracted PDF file was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_p${startPage}-p${endPage}.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving extracted file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Extract error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to extract pages.' });
    }
  });
});

// ==========================================
// 4. CONVERT TO GRAYSCALE (/grayscale)
// ==========================================
app.post('/grayscale', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `grayscale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Grayscale PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_grayscale.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving grayscale file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Grayscale error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to grayscale.' });
    }
  });
});

// ==========================================
// 5. GENERATE JPEG PREVIEW (/preview)
// ==========================================
app.post('/preview', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `preview_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -sDEVICE=jpeg -r300 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Preview image was not generated.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_preview.jpg`;

      res.setHeader('Content-Type', 'image/jpeg');
      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving preview image:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Preview error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to generate JPEG preview.' });
    }
  });
});

// ==========================================
// 6. CONVERT TO ARCHIVAL PDF/A (/archive)
// ==========================================
app.post('/archive', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `pdfa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -dPDFA -dBATCH -dNOPAUSE -sProcessColorModel=DeviceRGB -sDEVICE=pdfwrite -dPDFACompatibilityPolicy=1 -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Archival PDF/A file was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_PDFA.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving PDF/A file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('PDF/A error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to archival PDF/A.' });
    }
  });
});

// ==========================================
// 7. CONVERT PDF TO WORD (/word)
// ==========================================
app.post('/word', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `word_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.docx`);
    const tempFiles = [inputPath, outputPath];

    try {
      await pdfHelpers.convertPdfToWord(inputPath, outputPath);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Word document (.docx) was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}.docx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving Word file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (pythonErr) {
      console.error('PDF to Word error:', pythonErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to Word document.' });
    }
  });
});

// ==========================================
// 8. MAKE PDF SEARCHABLE (OCR) (/ocr)
// ==========================================
app.post('/ocr', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      await pdfHelpers.makePdfSearchable(inputPath, outputPath);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'OCR processed PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_ocr.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving OCR file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (ocrErr) {
      console.error('OCR error:', ocrErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to perform OCR on PDF document.' });
    }
  });
});

// ==========================================
// 9. PROTECT PDF (/protect)
// ==========================================
app.post('/protect', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const password = (req.body.password || '').trim();
    if (!password) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Password is required to protect PDF.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `protected_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      await pdfHelpers.protectPdf(inputPath, outputPath, password);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Protected PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_protected.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving protected file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (procErr) {
      console.error('Protect PDF error:', procErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to encrypt and protect PDF.' });
    }
  });
});

// ==========================================
// 10. UNLOCK PDF (/unlock)
// ==========================================
app.post('/unlock', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const password = req.body.password || '';
    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `unlocked_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      await pdfHelpers.unlockPdf(inputPath, outputPath, password);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Unlocked PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_unlocked.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving unlocked file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (procErr) {
      console.error('Unlock PDF error:', procErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to unlock PDF. Please verify the password.' });
    }
  });
});

// ==========================================
// 11. ROTATE PDF (/rotate)
// ==========================================
app.post('/rotate', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const angle = parseInt(req.body.angle) || 90;
    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `rotated_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      await pdfHelpers.rotatePdf(inputPath, outputPath, angle);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Rotated PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_rotated.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving rotated file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (procErr) {
      console.error('Rotate PDF error:', procErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to rotate PDF document.' });
    }
  });
});

// ==========================================
// 12. DELETE PAGES (/delete-pages)
// ==========================================
app.post('/delete-pages', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const pages = (req.body.pages || '').trim();
    if (!pages) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Please specify page numbers to delete.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `deleted_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      await pdfHelpers.deletePdfPages(inputPath, outputPath, pages);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'PDF after page deletion was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_modified.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving modified file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (procErr) {
      console.error('Delete pages error:', procErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to delete specified pages from PDF.' });
    }
  });
});

// ==========================================
// 13. ADD PAGE NUMBERS / PAGINATE (/paginate)
// ==========================================
app.post('/paginate', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    let configJson = req.body.config;
    if (!configJson) {
      const configObj = {
        position: req.body.position || 'bottom-center',
        margin: req.body.margin || 'recommended',
        startPage: parseInt(req.body.startPage) || 1,
        fromPage: parseInt(req.body.fromPage) || 1,
        toPage: parseInt(req.body.toPage) || 999999,
        pattern: req.body.pattern || '{num}',
        fontSize: parseInt(req.body.fontSize) || 12,
        color: req.body.color || '#000000'
      };
      configJson = JSON.stringify(configObj);
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `paginated_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      await pdfHelpers.paginatePdf(inputPath, outputPath, configJson);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Paginated PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_paginated.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving paginated file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (procErr) {
      console.error('Paginate PDF error:', procErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to add page numbers to PDF.' });
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDF Precision Platform running on port ${PORT}`);
});
