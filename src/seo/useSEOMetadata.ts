import { useEffect } from "react";
import { toolsMetadata, ToolMetadata } from "./toolsData";

export interface UseSEOMetadataOptions {
  toolId?: string;
  title?: string;
  description?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: string;
  robots?: string;
  category?: string;
  featureList?: string[];
  howToSteps?: { name: string; text: string }[];
  customJsonLd?: object;
}

export function useSEOMetadata(options: UseSEOMetadataOptions = {}) {
  const {
    toolId,
    title,
    description,
    keywords,
    canonicalUrl,
    ogImage,
    ogType = "website",
    robots = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    category,
    featureList,
    howToSteps,
    customJsonLd,
  } = options;

  const tool: ToolMetadata | undefined = toolId ? toolsMetadata[toolId] : undefined;

  const finalTitle = title || (tool ? tool.metaTitle : "Vibify — Free Online PDF Tools & Document Workspace");
  const finalDescription = description || (tool ? tool.metaDescription : "Edit, merge, compress, sign, and convert PDFs instantly in your browser with Vibify.");
  const finalKeywords = (keywords && keywords.length > 0)
    ? keywords.join(", ")
    : (tool ? tool.keywords.join(", ") : "PDF tools, edit PDF, merge PDF, compress PDF, convert PDF, Vibify");
  const finalCanonical = canonicalUrl || (tool ? tool.canonicalUrl : "https://vibify.tech/");
  const finalImage = ogImage || (tool ? tool.ogImage : "https://vibify.tech/vibify-og-image.png");
  const finalCategory = category || (tool ? tool.category : "UtilitiesApplication");
  const finalFeatures = featureList || (tool ? tool.featureList : []);
  const finalHowTo = howToSteps || (tool ? tool.howToSteps : []);

  useEffect(() => {
    // Set Title
    document.title = finalTitle;

    // Helper for Meta
    const setMeta = (attr: "name" | "property", key: string, content: string) => {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // Primary Meta
    setMeta("name", "title", finalTitle);
    setMeta("name", "description", finalDescription);
    setMeta("name", "keywords", finalKeywords);
    setMeta("name", "robots", robots);
    setMeta("name", "author", "Vibify");

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", finalCanonical);

    // OpenGraph
    setMeta("property", "og:type", ogType);
    setMeta("property", "og:url", finalCanonical);
    setMeta("property", "og:title", finalTitle);
    setMeta("property", "og:description", finalDescription);
    setMeta("property", "og:image", finalImage);
    setMeta("property", "og:site_name", "Vibify");
    setMeta("property", "og:locale", "en_US");

    // Twitter
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:site", "@vibifytech");
    setMeta("name", "twitter:url", finalCanonical);
    setMeta("name", "twitter:title", finalTitle);
    setMeta("name", "twitter:description", finalDescription);
    setMeta("name", "twitter:image", finalImage);

    // JSON-LD Script
    const SCRIPT_ID = "vibify-dynamic-seo-schema";
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }

    if (customJsonLd) {
      script.textContent = JSON.stringify(customJsonLd, null, 2);
    } else {
      const graphNodes: any[] = [
        {
          "@type": "WebApplication",
          "@id": `${finalCanonical}#app`,
          name: tool ? tool.title : "Vibify",
          url: finalCanonical,
          description: finalDescription,
          applicationCategory: finalCategory,
          operatingSystem: "All (Web Browser)",
          browserRequirements: "Requires JavaScript. Modern browser recommended.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          featureList: finalFeatures,
        },
        {
          "@type": "BreadcrumbList",
          "@id": `${finalCanonical}#breadcrumbs`,
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: "https://vibify.tech/",
            },
            ...(tool ? [
              {
                "@type": "ListItem",
                position: 2,
                name: tool.title,
                item: finalCanonical,
              },
            ] : []),
          ],
        },
      ];

      if (finalHowTo && finalHowTo.length > 0) {
        graphNodes.push({
          "@type": "HowTo",
          "@id": `${finalCanonical}#howto`,
          name: `How to use ${tool ? tool.title : "Vibify PDF Tool"}`,
          description: `Step-by-step guide for ${tool ? tool.title : "Vibify"}.`,
          step: finalHowTo.map((s, idx) => ({
            "@type": "HowToStep",
            position: idx + 1,
            name: s.name,
            text: s.text,
            url: `${finalCanonical}#step-${idx + 1}`,
          })),
        });
      }

      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": graphNodes,
      }, null, 2);
    }
  }, [
    finalTitle,
    finalDescription,
    finalKeywords,
    finalCanonical,
    finalImage,
    ogType,
    robots,
    finalCategory,
    finalFeatures,
    finalHowTo,
    customJsonLd,
  ]);
}
