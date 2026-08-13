const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 1. Full Color SVG Logo for Vibify (Light Mode / Dark Text)
const svgFullLogoLight = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 140" width="100%" height="100%">
  <defs>
    <!-- V Gradient: Violet to Vibrant Blue -->
    <linearGradient id="vGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7C3AED"/>
      <stop offset="40%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
  </defs>

  <!-- Stylized V Mark -->
  <g transform="translate(15, 10)">
    <path d="M 25 25 L 62 102 C 65 108, 73 108, 76 102 L 122 25" 
          fill="none" 
          stroke="url(#vGradLight)" 
          stroke-width="28" 
          stroke-linecap="round" 
          stroke-linejoin="round"/>
  </g>

  <!-- Wordmark 'vibify' -->
  <text x="165" y="92" 
        font-family="'Plus Jakarta Sans', 'Inter', -apple-system, blinkmacsystemfont, 'Segoe UI', roboto, sans-serif" 
        font-weight="700" 
        font-size="82" 
        letter-spacing="-2.5" 
        fill="#0f172a">vibify</text>
</svg>
`;

// 2. Full Color SVG Logo for Dark Backgrounds (White Text)
const svgFullLogoDark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 140" width="100%" height="100%">
  <defs>
    <linearGradient id="vGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="40%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>

  <!-- Stylized V Mark -->
  <g transform="translate(15, 10)">
    <path d="M 25 25 L 62 102 C 65 108, 73 108, 76 102 L 122 25" 
          fill="none" 
          stroke="url(#vGradDark)" 
          stroke-width="28" 
          stroke-linecap="round" 
          stroke-linejoin="round"/>
  </g>

  <!-- Wordmark 'vibify' in White -->
  <text x="165" y="92" 
        font-family="'Plus Jakarta Sans', 'Inter', -apple-system, blinkmacsystemfont, 'Segoe UI', roboto, sans-serif" 
        font-weight="700" 
        font-size="82" 
        letter-spacing="-2.5" 
        fill="#ffffff">vibify</text>
</svg>
`;

// 3. Icon Mark SVG (Standalone V Badge / Favicon)
const svgIconMark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <linearGradient id="vIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7C3AED"/>
      <stop offset="45%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
  </defs>

  <!-- Squircle White App Container -->
  <rect x="8" y="8" width="184" height="184" rx="44" fill="#ffffff" stroke="#e2e8f0" stroke-width="3"/>

  <!-- Stylized V Mark -->
  <g transform="translate(25, 25)">
    <path d="M 28 30 L 73 125 C 76 131, 84 131, 87 125 L 132 30" 
          fill="none" 
          stroke="url(#vIconGrad)" 
          stroke-width="32" 
          stroke-linecap="round" 
          stroke-linejoin="round"/>
  </g>
</svg>
`;

// 4. Social Open Graph (1200x630) Banner Card
const svgOgBanner = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="ogBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="vOgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="50%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#ogBg)"/>

  <!-- Soft Ambient Glow -->
  <circle cx="250" cy="200" r="280" fill="#7c3aed" opacity="0.18" filter="blur(70px)"/>
  <circle cx="950" cy="450" r="300" fill="#2563eb" opacity="0.18" filter="blur(70px)"/>

  <!-- Outer Frame -->
  <rect x="40" y="40" width="1120" height="550" rx="32" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>

  <!-- Vibify Full White Logo -->
  <g transform="translate(100, 120) scale(1.5)">
    ${svgFullLogoDark.replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </g>

  <!-- Headline & Subtitle -->
  <text x="100" y="380" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="44" fill="#ffffff">
    Free Online PDF Tools &amp; Smart Workspace
  </text>
  <text x="100" y="435" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500" font-size="24" fill="#94a3b8">
    Compress, Merge, OCR, Convert to Word, Protect, Unlock &amp; Edit PDFs instantly.
  </text>

  <!-- Pill Badge -->
  <g transform="translate(100, 485)">
    <rect x="0" y="0" width="220" height="52" rx="26" fill="url(#vOgGrad)"/>
    <text x="110" y="33" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="20" fill="#ffffff" text-anchor="middle">
      vibify.tech
    </text>
  </g>
</svg>
`;

async function main() {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Save SVG files
  fs.writeFileSync(path.join(publicDir, 'vibify-logo.svg'), svgFullLogoLight);
  fs.writeFileSync(path.join(publicDir, 'vibify-logo-white.svg'), svgFullLogoDark);
  fs.writeFileSync(path.join(publicDir, 'vibify-icon.svg'), svgIconMark);
  fs.writeFileSync(path.join(publicDir, 'vibify-og.svg'), svgOgBanner);

  console.log('Saved SVG files.');

  // Convert to PNG sizes using Sharp
  const conversions = [
    { svg: svgIconMark, name: 'favicon-16x16.png', width: 16, height: 16 },
    { svg: svgIconMark, name: 'favicon-32x32.png', width: 32, height: 32 },
    { svg: svgIconMark, name: 'favicon-48x48.png', width: 48, height: 48 },
    { svg: svgIconMark, name: 'apple-touch-icon.png', width: 180, height: 180 },
    { svg: svgIconMark, name: 'android-chrome-192x192.png', width: 192, height: 192 },
    { svg: svgIconMark, name: 'android-chrome-512x512.png', width: 512, height: 512 },
    { svg: svgIconMark, name: 'vibify-icon-512.png', width: 512, height: 512 },
    { svg: svgFullLogoLight, name: 'vibify-logo-header.png', width: 360, height: 110 },
    { svg: svgFullLogoDark, name: 'vibify-logo-footer.png', width: 360, height: 110 },
    { svg: svgFullLogoLight, name: 'vibify-logo-512.png', width: 512, height: 156 },
    { svg: svgOgBanner, name: 'vibify-og-image.png', width: 1200, height: 630 },
  ];

  for (const item of conversions) {
    const filePath = path.join(publicDir, item.name);
    await sharp(Buffer.from(item.svg))
      .resize(item.width, item.height)
      .png()
      .toFile(filePath);
    console.log(`Generated: ${item.name} (${item.width}x${item.height})`);
  }

  // Copy 32x32 to favicon.ico
  fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(publicDir, 'favicon.ico'));
  console.log('Favicon.ico created successfully!');
}

main().catch(err => {
  console.error('Error generating logos:', err);
  process.exit(1);
});
