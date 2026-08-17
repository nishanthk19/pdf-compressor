import React, { useState } from "react";
import { SEOMetadata } from "./components/SEOMetadata";
import { toolsMetadata } from "./seo/toolsData";

export default function App() {
  const [selectedTool, setSelectedTool] = useState<string>("compress");
  const toolKeys = Object.keys(toolsMetadata);
  const activeToolData = toolsMetadata[selectedTool] || toolsMetadata.compress;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white flex flex-col">
      {/* Dynamic SEO Metadata & JSON-LD Injection */}
      <SEOMetadata toolId={selectedTool} />

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25">
            V
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight text-white">Vibify</span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800">
              SEO Engine Active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
          <a href="/" className="hover:text-white transition">Landing Page</a>
          <a href="/tools/compress" className="hover:text-white transition">Live Studio</a>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex-1 flex flex-col gap-8">
        {/* Title and Overview */}
        <section className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Dynamic PDF Tool Metadata &amp; JSON-LD Hub
          </h1>
          <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
            Select any PDF tool below to dynamically inject search engine metadata, OpenGraph tags, Twitter cards, and Schema.org <code className="text-indigo-400 font-mono text-xs">WebApplication</code> / <code className="text-indigo-400 font-mono text-xs">HowTo</code> JSON-LD graphs into the document head for crawler indexing.
          </p>
        </section>

        {/* Tool Selector Chips */}
        <section className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
            Select Tool to Preview Dynamic Metadata Injection:
          </label>
          <div className="flex flex-wrap gap-2">
            {toolKeys.map((key) => {
              const item = toolsMetadata[key];
              const isSelected = selectedTool === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedTool(key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-[1.02]"
                      : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60"
                  }`}
                >
                  <span>{item.title.split(" - ")[0]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Live Active Metadata Inspector */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Metadata & OpenGraph Preview */}
          <div className="lg:col-span-6 space-y-6">
            {/* Meta Summary Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Injected Document Head Tags</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                  DOM Synced
                </span>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">Page Title (&lt;title&gt;)</span>
                <p className="text-sm font-semibold text-white font-mono bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  {activeToolData.metaTitle}
                </p>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">Meta Description</span>
                <p className="text-xs text-slate-300 font-mono bg-slate-900 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                  {activeToolData.metaDescription}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">Canonical URL</span>
                  <p className="text-xs text-indigo-400 font-mono bg-slate-900 p-2 rounded-lg border border-slate-800 truncate">
                    {activeToolData.canonicalUrl}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">Schema Category</span>
                  <p className="text-xs text-teal-400 font-mono bg-slate-900 p-2 rounded-lg border border-slate-800 truncate">
                    {activeToolData.category}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">Keywords</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {activeToolData.keywords.map((kw, i) => (
                    <span key={i} className="text-[11px] font-mono bg-slate-900 text-slate-300 px-2 py-0.5 rounded-md border border-slate-800">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <a
                  href={`/tools/${activeToolData.id}`}
                  className="inline-flex items-center justify-center w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg transition"
                >
                  Open Live {activeToolData.title} Studio &rarr;
                </a>
              </div>
            </div>

            {/* Social Share Card Preview */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                OpenGraph / Twitter Card Visual Preview
              </span>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center relative p-4">
                  <div className="text-center">
                    <span className="text-xs font-black text-indigo-400 tracking-widest uppercase block mb-1">VIBIFY.TECH</span>
                    <h3 className="text-lg font-black text-white">{activeToolData.title}</h3>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  <span className="text-[11px] font-mono text-slate-500 uppercase">vibify.tech</span>
                  <h4 className="text-xs font-bold text-white truncate">{activeToolData.metaTitle}</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{activeToolData.metaDescription}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: JSON-LD Graph Inspector */}
          <div className="lg:col-span-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3 h-full flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Generated Schema.org JSON-LD (application/ld+json)
                </span>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded-full">
                  Schema.org v2026
                </span>
              </div>

              <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto">
                <pre className="text-xs font-mono text-indigo-300 leading-relaxed">
                  {JSON.stringify(
                    {
                      "@context": "https://schema.org",
                      "@graph": [
                        {
                          "@type": "WebApplication",
                          "@id": `${activeToolData.canonicalUrl}#app`,
                          name: activeToolData.title,
                          url: activeToolData.canonicalUrl,
                          description: activeToolData.metaDescription,
                          applicationCategory: activeToolData.category,
                          operatingSystem: activeToolData.operatingSystem,
                          offers: {
                            "@type": "Offer",
                            price: "0",
                            priceCurrency: "USD",
                          },
                          featureList: activeToolData.featureList,
                        },
                        {
                          "@type": "BreadcrumbList",
                          "@id": `${activeToolData.canonicalUrl}#breadcrumbs`,
                          itemListElement: [
                            {
                              "@type": "ListItem",
                              position: 1,
                              name: "Home",
                              item: "https://vibify.tech/",
                            },
                            {
                              "@type": "ListItem",
                              position: 2,
                              name: activeToolData.title,
                              item: activeToolData.canonicalUrl,
                            },
                          ],
                        },
                        {
                          "@type": "HowTo",
                          "@id": `${activeToolData.canonicalUrl}#howto`,
                          name: `How to use ${activeToolData.title}`,
                          step: activeToolData.howToSteps.map((step, idx) => ({
                            "@type": "HowToStep",
                            position: idx + 1,
                            name: step.name,
                            text: step.text,
                            url: `${activeToolData.canonicalUrl}#step-${idx + 1}`,
                          })),
                        },
                      ],
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
