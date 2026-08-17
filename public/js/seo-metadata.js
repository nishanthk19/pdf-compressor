/**
 * Vibify SEO Metadata Engine
 * Dynamically injects and synchronizes SEO meta tags, OpenGraph tags,
 * Twitter Cards, Canonical links, and Schema.org JSON-LD structured data.
 */
(function () {
  const TOOLS_SEO_DATABASE = {
    compress: {
      title: "Compress PDF Online - Target File Size | vibify.tech",
      description: "Compress PDF online to an exact target size in MB (e.g. 2MB or 500KB) on vibify.tech. Free, fast & secure PDF size reducer with zero quality loss.",
      keywords: "compress pdf, reduce pdf size, shrink pdf to 2mb, target size pdf compression, online pdf compressor, vibify.tech",
      canonical: "https://vibify.tech/tools/compress",
      category: "UtilitiesApplication",
      appName: "Vibify Compress PDF",
      features: [
        "Custom target size MB input",
        "Visual compression preview",
        "Client-side processing with zero server retention",
        "Preserves text clarity and vector graphics"
      ],
      howTo: [
        { name: "Upload PDF", text: "Drag and drop your PDF document or select it from your device." },
        { name: "Set Target Size", text: "Specify your desired target file size in megabytes (MB) or choose a preset." },
        { name: "Compress & Download", text: "Click Compress to process the document and immediately save the optimized PDF." }
      ]
    },
    merge: {
      title: "Merge PDF Files Online - Combine PDFs Free | vibify.tech",
      description: "Merge and combine multiple PDF files into a single document online for free on vibify.tech. Drag & drop to reorder, fast and secure.",
      keywords: "merge pdf, combine pdf, join pdf files, merge pdf online, pdf combiner, vibify.tech",
      canonical: "https://vibify.tech/tools/merge",
      category: "UtilitiesApplication",
      appName: "Vibify Merge PDF",
      features: [
        "Merge unlimited PDF documents",
        "Interactive drag & drop file reordering",
        "Fast in-browser assembly",
        "Privacy-first zero data storage"
      ],
      howTo: [
        { name: "Select PDFs", text: "Upload two or more PDF files you want to combine." },
        { name: "Arrange Order", text: "Drag and drop the document cards into your preferred sequence." },
        { name: "Merge & Save", text: "Click Merge PDFs to generate and download your unified document." }
      ]
    },
    ocr: {
      title: "OCR PDF Online - Extract & Search Text | vibify.tech",
      description: "Run fast OCR text recognition on scanned PDFs and images. Convert scanned documents into searchable, copyable text instantly.",
      keywords: "ocr pdf, optical character recognition, scanned pdf to text, searchable pdf, extract text from pdf",
      canonical: "https://vibify.tech/tools/ocr",
      category: "BusinessApplication",
      appName: "Vibify OCR Recognition",
      features: [
        "High-precision multilingual text recognition",
        "Searchable PDF & plain text output options",
        "Instant in-browser preview",
        "Secure client-side document processing"
      ],
      howTo: [
        { name: "Upload Scanned Document", text: "Select your scanned PDF or image document." },
        { name: "Run OCR Recognition", text: "Select language preferences and initialize the OCR engine." },
        { name: "Copy or Download", text: "Export the searchable PDF or copy extracted text with one click." }
      ]
    },
    word: {
      title: "Convert PDF to Word Online (DOCX) | vibify.tech",
      description: "Convert PDF to Word DOCX documents online for free. Accurate layout preservation and instant editable Word exports.",
      keywords: "pdf to word, pdf to docx, convert pdf to word online, editable pdf to word, free docx converter",
      canonical: "https://vibify.tech/tools/word",
      category: "OfficeApplication",
      appName: "Vibify PDF to Word Converter",
      features: [
        "Faithful preservation of tables, columns, and styles",
        "Outputs standard Microsoft Word (.docx) format",
        "High-speed document conversion",
        "Confidential file handling with auto cleanup"
      ],
      howTo: [
        { name: "Upload PDF Document", text: "Upload the PDF file you wish to edit in Word." },
        { name: "Process Conversion", text: "Our conversion engine extracts paragraphs, headers, and tables." },
        { name: "Download DOCX", text: "Download your fully editable Microsoft Word document." }
      ]
    },
    "add-text": {
      title: "Add Text & Annotations to PDF Online | vibify.tech",
      description: "Add custom text, comments, and annotations onto any PDF online. Free interactive visual positioning editor on vibify.tech.",
      keywords: "add text to pdf, write on pdf, edit pdf text, annotate pdf, pdf text inserter",
      canonical: "https://vibify.tech/tools/add-text",
      category: "DesignApplication",
      appName: "Vibify PDF Text Inserter",
      features: [
        "Draggable text placement anywhere on canvas",
        "Custom font families, sizing, colors, and alignment",
        "Multi-page annotation support",
        "Instant crisp vector PDF download"
      ],
      howTo: [
        { name: "Upload PDF", text: "Load your PDF file into the visual editor." },
        { name: "Add & Position Text", text: "Click to add text boxes, style fonts, and drag to the desired position." },
        { name: "Export Document", text: "Download the updated PDF with your text cleanly rendered." }
      ]
    },
    protect: {
      title: "Protect PDF Online - Password Encryption | vibify.tech",
      description: "Password protect and encrypt PDF files online for free. Secure your documents with military-grade encryption on vibify.tech.",
      keywords: "protect pdf, password protect pdf, encrypt pdf, lock pdf file, secure pdf document",
      canonical: "https://vibify.tech/tools/protect",
      category: "SecurityApplication",
      appName: "Vibify PDF Protector",
      features: [
        "Industry-standard password encryption",
        "Restricts unauthorized viewing and printing",
        "Immediate secure file processing",
        "Zero plain-text password storage"
      ],
      howTo: [
        { name: "Upload File", text: "Choose the PDF document you want to secure." },
        { name: "Enter Password", text: "Type a strong encryption password to protect the file." },
        { name: "Download Encrypted PDF", text: "Save your encrypted, password-protected PDF." }
      ]
    },
    unlock: {
      title: "Unlock PDF Online - Remove Password Protection | vibify.tech",
      description: "Unlock PDF files and remove password restrictions online. Fast, secure, and hassle-free PDF decrypter on vibify.tech.",
      keywords: "unlock pdf, remove pdf password, decrypt pdf, pdf password remover, unlock protected pdf",
      canonical: "https://vibify.tech/tools/unlock",
      category: "SecurityApplication",
      appName: "Vibify PDF Unlocker",
      features: [
        "Removes owner and user password locks",
        "Restores full editing, printing, and copying permissions",
        "Instant client-side decryption workflow",
        "Guaranteed document integrity"
      ],
      howTo: [
        { name: "Upload Locked PDF", text: "Select your password-protected PDF." },
        { name: "Enter Decryption Key", text: "Provide the authorization password once." },
        { name: "Download Unlocked PDF", text: "Save the unrestricted, permanently unlocked PDF file." }
      ]
    },
    rotate: {
      title: "Rotate PDF Pages Online - Free Tool | vibify.tech",
      description: "Rotate PDF pages online for free. Fix upside-down or sideways pages with instant visual rotation controls on vibify.tech.",
      keywords: "rotate pdf, rotate pdf pages, flip pdf, fix upside down pdf, turn pdf sideways",
      canonical: "https://vibify.tech/tools/rotate",
      category: "UtilitiesApplication",
      appName: "Vibify PDF Rotator",
      features: [
        "Rotate single pages or all pages simultaneously",
        "Interactive 90° clockwise/counterclockwise orientation buttons",
        "Visual thumbnail preview before saving",
        "Fast lossless page reorientation"
      ],
      howTo: [
        { name: "Upload PDF", text: "Open your PDF document in the rotation studio." },
        { name: "Adjust Orientation", text: "Click the rotate icon on specific pages or choose Rotate All." },
        { name: "Save PDF", text: "Download the freshly oriented PDF document." }
      ]
    },
    delete: {
      title: "Delete PDF Pages Online - Remove Pages Free | vibify.tech",
      description: "Delete specific pages from a PDF online for free. Click to remove unwanted or blank pages and save a clean PDF document.",
      keywords: "delete pdf pages, remove pages from pdf, cut pdf pages, delete blank pdf pages, clean pdf document",
      canonical: "https://vibify.tech/tools/delete",
      category: "UtilitiesApplication",
      appName: "Vibify PDF Page Deleter",
      features: [
        "Click-to-delete interactive page grid",
        "Bulk page range selector (e.g. 1-3, 5, 8-10)",
        "High-resolution page preview thumbnails",
        "Preserves original PDF bookmarks and structure"
      ],
      howTo: [
        { name: "Select PDF Document", text: "Upload the PDF you want to trim." },
        { name: "Select Pages to Remove", text: "Click unwanted pages to mark them for deletion." },
        { name: "Download Clean PDF", text: "Save the document with the selected pages permanently removed." }
      ]
    },
    extract: {
      title: "Extract PDF Pages Online - Split PDF Free | vibify.tech",
      description: "Extract pages from PDF online for free. Select custom page ranges or single pages to export into a new PDF document.",
      keywords: "extract pdf pages, split pdf, save selected pdf pages, pdf page extractor, separate pdf pages",
      canonical: "https://vibify.tech/tools/extract",
      category: "UtilitiesApplication",
      appName: "Vibify PDF Extractor",
      features: [
        "Extract individual or custom ranges into a new file",
        "Option to export each page as separate PDF files",
        "Intuitive visual multi-page selection",
        "Preserves embedded fonts, images, and formatting"
      ],
      howTo: [
        { name: "Upload Document", text: "Select the PDF from which you want to extract pages." },
        { name: "Choose Pages", text: "Click the specific pages or enter page numbers to extract." },
        { name: "Download Extracted File", text: "Save your new PDF containing only the chosen pages." }
      ]
    },
    paginate: {
      title: "Add Page Numbers to PDF Online | vibify.tech",
      description: "Add page numbers to PDF documents online. Customize font, size, position, and numbering style for professional documents.",
      keywords: "add page numbers to pdf, paginate pdf, number pdf pages, pdf page numbering tool, bates numbering",
      canonical: "https://vibify.tech/tools/paginate",
      category: "UtilitiesApplication",
      appName: "Vibify PDF Paginator",
      features: [
        "Custom placement: top/bottom, left/center/right",
        "Multiple formats: 1, 2, 3... Page 1 of N, Roman (i, ii...)",
        "Start numbering on custom page offsets",
        "Real-time visual preview before generation"
      ],
      howTo: [
        { name: "Upload PDF", text: "Choose your PDF document in the pagination studio." },
        { name: "Configure Formatting", text: "Select position, font size, margin, and numbering format." },
        { name: "Download Numbered PDF", text: "Apply numbering and download your paginated document." }
      ]
    },
    archive: {
      title: "Convert PDF to PDF/A Online (Archival Standard) | vibify.tech",
      description: "Convert PDF to PDF/A online for free. Ensure ISO compliance for long-term document archiving and legal validity.",
      keywords: "pdf to pdf/a, pdf archival converter, iso 19005 compliant pdf, long term pdf preservation, pdfa converter",
      canonical: "https://vibify.tech/tools/archive",
      category: "BusinessApplication",
      appName: "Vibify PDF/A Archival Converter",
      features: [
        "ISO 19005 compliant PDF/A conversion",
        "Embeds missing color profiles and font subsets",
        "Guarantees future visual fidelity and machine readability",
        "Meets legal, government, and archival standards"
      ],
      howTo: [
        { name: "Upload PDF File", text: "Select the PDF file you wish to archive." },
        { name: "Select PDF/A Profile", text: "Choose compliance standard (PDF/A-1b, PDF/A-2b)." },
        { name: "Convert & Save", text: "Download your certified archival PDF/A document." }
      ]
    },
    "pdf-maker": {
      title: "Smart PDF Maker Studio - Create PDFs in Browser | vibify.tech",
      description: "Create rich PDF documents directly in your browser with our Notion-style block editor. Instant PDF and DOCX export with zero software installation.",
      keywords: "pdf maker, create pdf online, notion style pdf editor, online document maker, browser pdf creator",
      canonical: "https://vibify.tech/tools/pdf-maker",
      category: "DesignApplication",
      appName: "Vibify Smart PDF Maker Studio",
      features: [
        "Rich block-based document composition",
        "Headings, callouts, tables, checklists, and code blocks",
        "Direct high-resolution vector PDF export",
        "Optional editable Microsoft Word (.docx) export"
      ],
      howTo: [
        { name: "Compose Content", text: "Type or paste content using rich block formatting." },
        { name: "Customize Design", text: "Pick fonts, colors, line heights, and margins." },
        { name: "Export Document", text: "Download your publication-ready PDF or Word file instantly." }
      ]
    }
  };

  function setMeta(attr, key, val) {
    if (!val) return;
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", val);
  }

  function setCanonical(url) {
    if (!url) return;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", url);
  }

  function injectJsonLd(schemaObj) {
    const ID = "vibify-dynamic-seo-schema";
    let script = document.getElementById(ID);
    if (!script) {
      script = document.createElement("script");
      script.id = ID;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schemaObj, null, 2);
  }

  function detectToolKey() {
    const path = window.location.pathname.toLowerCase();
    for (const key of Object.keys(TOOLS_SEO_DATABASE)) {
      if (path.includes(`/tools/${key}`) || path.includes(`/${key}.html`) || path.includes(`/${key}`)) {
        return key;
      }
    }
    if (path.includes("paginate-editor")) return "paginate";
    if (path.includes("overlay-editor")) return "add-text";
    if (path.includes("flow-editor")) return "pdf-maker";
    return null;
  }

  function applySeo(toolKey, overrideOpts) {
    const data = TOOLS_SEO_DATABASE[toolKey];
    if (!data) return;

    const finalTitle = (overrideOpts && overrideOpts.title) || data.title;
    const finalDesc = (overrideOpts && overrideOpts.description) || data.description;
    const finalKeywords = (overrideOpts && overrideOpts.keywords) || data.keywords;
    const finalCanonical = (overrideOpts && overrideOpts.canonical) || data.canonical;
    const finalImage = (overrideOpts && overrideOpts.image) || "https://vibify.tech/vibify-og-image.png";

    // 1. Page Title
    document.title = finalTitle;

    // 2. Primary Meta Tags
    setMeta("name", "title", finalTitle);
    setMeta("name", "description", finalDesc);
    setMeta("name", "keywords", finalKeywords);
    setMeta("name", "robots", "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1");
    setMeta("name", "author", "Vibify");
    setCanonical(finalCanonical);

    // 3. OpenGraph Tags
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", finalCanonical);
    setMeta("property", "og:title", finalTitle);
    setMeta("property", "og:description", finalDesc);
    setMeta("property", "og:image", finalImage);
    setMeta("property", "og:image:alt", data.appName || "Vibify Online PDF Tools");
    setMeta("property", "og:site_name", "Vibify");
    setMeta("property", "og:locale", "en_US");

    // 4. Twitter Card Tags
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:site", "@vibifytech");
    setMeta("name", "twitter:url", finalCanonical);
    setMeta("name", "twitter:title", finalTitle);
    setMeta("name", "twitter:description", finalDesc);
    setMeta("name", "twitter:image", finalImage);

    // 5. JSON-LD Structured Data Graph
    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebApplication",
          "@id": `${finalCanonical}#webapp`,
          name: data.appName || "Vibify PDF Tool",
          url: finalCanonical,
          description: finalDesc,
          applicationCategory: data.category || "UtilitiesApplication",
          operatingSystem: "All (Web Browser)",
          browserRequirements: "Requires JavaScript. Modern browser recommended.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
          },
          featureList: data.features || []
        },
        {
          "@type": "BreadcrumbList",
          "@id": `${finalCanonical}#breadcrumbs`,
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: "https://vibify.tech/"
            },
            {
              "@type": "ListItem",
              position: 2,
              name: data.appName || "PDF Tool",
              item: finalCanonical
            }
          ]
        },
        {
          "@type": "HowTo",
          "@id": `${finalCanonical}#howto`,
          name: `How to use ${data.appName}`,
          description: `Step-by-step instructions for ${data.appName} on vibify.tech`,
          step: (data.howTo || []).map((step, idx) => ({
            "@type": "HowToStep",
            position: idx + 1,
            name: step.name,
            text: step.text,
            url: `${finalCanonical}#step-${idx + 1}`
          }))
        }
      ]
    };

    injectJsonLd(schema);
  }

  // Global API
  window.VibifySEO = {
    inject: applySeo,
    database: TOOLS_SEO_DATABASE
  };

  // Auto-init on page load if matched
  function init() {
    const tool = detectToolKey();
    if (tool) {
      applySeo(tool);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
