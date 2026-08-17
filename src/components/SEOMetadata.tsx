import React, { useEffect } from "react";
import { toolsMetadata, ToolMetadata } from "../seo/toolsData";

export interface SEOMetadataProps {
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

function setMetaTag(nameOrProperty: "name" | "property", key: string, content: string) {
  if (!content) return;
  let element = document.querySelector(`meta[${nameOrProperty}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(nameOrProperty, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setCanonicalUrl(url: string) {
  if (!url) return;
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function injectJsonLd(schemaData: object) {
  const SCRIPT_ID = "vibify-dynamic-seo-schema";
  let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schemaData, null, 2);
}

export const SEOMetadata: React.FC<SEOMetadataProps> = ({
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
}) => {
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
    // 1. Page Title
    document.title = finalTitle;

    // 2. Primary Meta Tags
    setMetaTag("name", "title", finalTitle);
    setMetaTag("name", "description", finalDescription);
    setMetaTag("name", "keywords", finalKeywords);
    setMetaTag("name", "robots", robots);
    setMetaTag("name", "author", "Vibify");

    // 3. Canonical Link
    setCanonicalUrl(finalCanonical);

    // 4. OpenGraph Tags
    setMetaTag("property", "og:type", ogType);
    setMetaTag("property", "og:url", finalCanonical);
    setMetaTag("property", "og:title", finalTitle);
    setMetaTag("property", "og:description", finalDescription);
    setMetaTag("property", "og:image", finalImage);
    setMetaTag("property", "og:site_name", "Vibify");
    setMetaTag("property", "og:locale", "en_US");

    // 5. Twitter Card Tags
    setMetaTag("name", "twitter:card", "summary_large_image");
    setMetaTag("name", "twitter:site", "@vibifytech");
    setMetaTag("name", "twitter:url", finalCanonical);
    setMetaTag("name", "twitter:title", finalTitle);
    setMetaTag("name", "twitter:description", finalDescription);
    setMetaTag("name", "twitter:image", finalImage);

    // 6. Structured JSON-LD Data Construction
    if (customJsonLd) {
      injectJsonLd(customJsonLd);
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

      // If How-To steps exist, attach Schema.org HowTo for Google Rich Snippets
      if (finalHowTo && finalHowTo.length > 0) {
        graphNodes.push({
          "@type": "HowTo",
          "@id": `${finalCanonical}#howto`,
          name: `How to use ${tool ? tool.title : "Vibify PDF Tool"}`,
          description: `Simple step-by-step guide to processing your PDF with ${tool ? tool.title : "Vibify"}.`,
          step: finalHowTo.map((s, idx) => ({
            "@type": "HowToStep",
            position: idx + 1,
            name: s.name,
            text: s.text,
            url: `${finalCanonical}#step-${idx + 1}`,
          })),
        });
      }

      injectJsonLd({
        "@context": "https://schema.org",
        "@graph": graphNodes,
      });
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

  return null;
};

export default SEOMetadata;
