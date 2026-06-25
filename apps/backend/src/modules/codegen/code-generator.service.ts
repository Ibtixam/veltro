import { Injectable, Logger } from '@nestjs/common';
import { OpportunityCluster } from '../hunter/opportunity-hunter.service';
import JSZip from 'jszip';

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedPackage {
  zipBuffer: Buffer;
  files: GeneratedFile[];
  summary: {
    domain: string;
    cycleDate: string;
    pagesGenerated: number;
    estimatedTrafficGain: number;
  };
}

// ─── SERVICE ─────────────────────────────────────────────────────────────

@Injectable()
export class CodeGeneratorService {
  private readonly logger = new Logger(CodeGeneratorService.name);

  async generatePackage(
    domain: string,
    opportunities: OpportunityCluster[],
    cycleDate: Date,
  ): Promise<GeneratedPackage> {
    const files: GeneratedFile[] = [];

    // 1. Schema components (once per package)
    files.push(this.generateSchemaComponent(domain));

    // 2. One page per codePagesNeeded across all clusters
    const seenSlugs = new Set<string>();
    for (const opp of opportunities) {
      for (const pageSlug of opp.codePagesNeeded) {
        if (seenSlugs.has(pageSlug)) continue;
        seenSlugs.add(pageSlug);
        files.push(this.generatePage(domain, opp, pageSlug));
      }
    }

    // 3. Sitemap update
    files.push(this.generateSitemapAdditions(domain, opportunities));

    // 4. Install guide for this cycle
    files.push(this.generateInstallGuide(domain, files, cycleDate, opportunities));

    // 5. ZIP it
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.path, file.content);
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    return {
      zipBuffer,
      files,
      summary: {
        domain,
        cycleDate: cycleDate.toISOString().split('T')[0],
        pagesGenerated: files.filter(f => f.path.includes('page.tsx')).length,
        estimatedTrafficGain: opportunities.reduce((s, o) => s + o.estimatedMonthlyTraffic, 0),
      },
    };
  }

  // ─── PAGE GENERATOR ──────────────────────────────────────────────────

  private generatePage(domain: string, opp: OpportunityCluster, pageSlug: string): GeneratedFile {
    const isComparison = pageSlug.includes('/compare/');
    const isFrench     = pageSlug.includes('/fr/');
    const isGeo        = pageSlug.includes('/leads/');

    const content = isComparison ? this.comparisonPageTemplate(domain, opp)
                  : isFrench     ? this.frenchPageTemplate(domain, opp)
                  : isGeo        ? this.geoPageTemplate(domain, opp, pageSlug)
                  :                this.pillarPageTemplate(domain, opp);

    return { path: `src/app${pageSlug}/page.tsx`, content };
  }

  private pillarPageTemplate(domain: string, opp: OpportunityCluster): string {
    const title = this.toTitleCase(opp.pillarKeyword);
    const satellites = opp.satellites.slice(0, 5);

    const faqItems = [
      { q: `What is ${opp.pillarKeyword}?`, a: `${title} refers to the process of discovering and connecting with potential business customers. ${domain} provides real-time ${opp.pillarKeyword} tools covering global markets.` },
      { q: `How does ${domain} help with ${opp.pillarKeyword}?`, a: `${domain} queries multiple live data sources simultaneously to discover verified contacts with email, phone, and WhatsApp information.` },
      { q: `Is there a free trial for ${opp.pillarKeyword} tools?`, a: `Yes. ${domain} offers a free trial with limited searches to validate data quality before subscribing.` },
    ];

    return `import type { Metadata } from 'next';
import { FAQSchema, SoftwareAppSchema } from '@/components/seo/SchemaOrg';

export const metadata: Metadata = {
  title: '${title} — Real-Time & Verified | ${this.domainToName(domain)}',
  description: 'Discover ${opp.pillarKeyword} instantly. ${satellites.slice(0, 2).join(', ')}. Verified contacts with email, phone and WhatsApp. Free trial.',
  keywords: ${JSON.stringify([opp.pillarKeyword, ...satellites.slice(0, 4)])},
  alternates: { canonical: 'https://${domain}/solutions/${opp.pillarSlug}' },
  openGraph: {
    title: '${title} | ${this.domainToName(domain)}',
    description: 'Real-time ${opp.pillarKeyword} — ${opp.estimatedMonthlyTraffic} monthly visitors potential. Try free.',
    url: 'https://${domain}/solutions/${opp.pillarSlug}',
  }
};

const FAQ_ITEMS = ${JSON.stringify(faqItems, null, 2)};

export default function Page() {
  return (
    <>
      <SoftwareAppSchema />
      <FAQSchema items={FAQ_ITEMS} />
      <main>
        <section>
          <h1>${title} — Verified Contacts in Real-Time</h1>
          <p>
            ${this.domainToName(domain)} delivers ${opp.pillarKeyword} results instantly by querying
            multiple live data sources simultaneously. No static database — every search is live.
          </p>
        </section>

        <section>
          <h2>Why ${opp.pillarKeyword} matters for your business</h2>
          <p>
            Finding the right business contacts is the foundation of B2B growth.
            ${this.domainToName(domain)} combines ${satellites.slice(0, 3).map(s => '"' + s + '"').join(', ')}
            and more into one unified search.
          </p>
        </section>

        <section>
          <h2>Related searches we cover</h2>
          <ul>
            ${satellites.map(s => `<li>${s}</li>`).join('\n            ')}
          </ul>
        </section>

        <section>
          <h2>Frequently Asked Questions</h2>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
`;
  }

  private comparisonPageTemplate(domain: string, opp: OpportunityCluster): string {
    const title = this.toTitleCase(opp.pillarKeyword);
    const competitor = opp.pillarKeyword.match(/(\w+\.\w+)\s+alternative/i)?.[1] ?? 'competitor';
    return `import type { Metadata } from 'next';
import { FAQSchema } from '@/components/seo/SchemaOrg';

export const metadata: Metadata = {
  title: '${title} — Honest Comparison 2026 | ${this.domainToName(domain)}',
  description: 'Comparing ${competitor} vs ${this.domainToName(domain)}: features, pricing, African coverage, WhatsApp support. Honest 2026 review.',
  keywords: ${JSON.stringify([opp.pillarKeyword, ...opp.satellites.slice(0, 3)])},
  alternates: { canonical: 'https://${domain}/compare/${opp.pillarSlug}' },
};

const FAQ_ITEMS = [
  { q: 'How does ${this.domainToName(domain)} compare to ${competitor}?', a: '${this.domainToName(domain)} focuses on real-time multi-source discovery with African and francophone market coverage. ${competitor} is stronger for static US/EU databases.' },
  { q: 'Is ${this.domainToName(domain)} cheaper than ${competitor}?', a: '${this.domainToName(domain)} is priced for global SMEs with entry plans significantly below enterprise tools.' },
];

export default function Page() {
  return (
    <>
      <FAQSchema items={FAQ_ITEMS} />
      <main>
        <h1>${title} — 2026 Honest Comparison</h1>
        <p>Looking for a ${competitor} alternative? Here is an honest side-by-side comparison.</p>
        <h2>When ${this.domainToName(domain)} wins</h2>
        <ul>
          <li>African and francophone market coverage</li>
          <li>Real-time discovery vs static database</li>
          <li>WhatsApp number detection</li>
          <li>SME-friendly pricing</li>
        </ul>
        <h2>When ${competitor} wins</h2>
        <ul>
          <li>Larger US/EU contact database</li>
          <li>More mature CRM integrations</li>
        </ul>
        <section>
          <h2>Frequently Asked Questions</h2>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}><h3>{item.q}</h3><p>{item.a}</p></div>
          ))}
        </section>
      </main>
    </>
  );
}
`;
  }

  private frenchPageTemplate(domain: string, opp: OpportunityCluster): string {
    const title = this.toTitleCase(opp.pillarKeyword);
    return `import type { Metadata } from 'next';
import { FAQSchema } from '@/components/seo/SchemaOrg';

export const metadata: Metadata = {
  title: '${title} — Guide Complet 2026 | ${this.domainToName(domain)}',
  description: 'Découvrez ${opp.pillarKeyword} en temps réel. Contacts vérifiés avec email, téléphone et WhatsApp. Essai gratuit.',
  keywords: ${JSON.stringify([opp.pillarKeyword, ...opp.satellites.slice(0, 3)])},
  alternates: {
    canonical: 'https://${domain}/fr/${opp.pillarSlug}',
    languages: { 'en': 'https://${domain}/solutions/${opp.pillarSlug}' }
  },
};

const FAQ_ITEMS = [
  { q: 'Comment fonctionne ${this.domainToName(domain)} pour ${opp.pillarKeyword} ?', a: '${this.domainToName(domain)} interroge plusieurs sources de données en temps réel pour retourner des contacts vérifiés avec email, téléphone et numéro WhatsApp.' },
  { q: 'Y a-t-il un essai gratuit ?', a: 'Oui. ${this.domainToName(domain)} propose un essai gratuit sans carte bancaire.' },
];

export default function Page() {
  return (
    <>
      <FAQSchema items={FAQ_ITEMS} />
      <main lang="fr">
        <h1>${title} — Guide Complet et Outil Gratuit</h1>
        <p>${this.domainToName(domain)} découvre des leads ${opp.pillarKeyword} en temps réel dans 40+ pays.</p>
        <h2>Pourquoi utiliser ${this.domainToName(domain)} pour ${opp.pillarKeyword}</h2>
        <p>Contrairement aux outils américains, ${this.domainToName(domain)} couvre l'Afrique francophone nativement.</p>
        <section>
          <h2>Questions fréquentes</h2>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}><h3>{item.q}</h3><p>{item.a}</p></div>
          ))}
        </section>
      </main>
    </>
  );
}
`;
  }

  private geoPageTemplate(domain: string, opp: OpportunityCluster, pageSlug: string): string {
    const country = pageSlug.split('/leads/')[1] ?? 'Africa';
    const countryTitle = this.toTitleCase(country.replace(/-/g, ' '));
    return `import type { Metadata } from 'next';
import { FAQSchema } from '@/components/seo/SchemaOrg';

export const metadata: Metadata = {
  title: 'B2B Leads in ${countryTitle} — Real-Time Business Contacts | ${this.domainToName(domain)}',
  description: 'Find verified B2B contacts in ${countryTitle} instantly — emails, phones, WhatsApp. Free trial.',
  keywords: ['B2B leads ${countryTitle}', 'business contacts ${countryTitle}', 'lead finder ${countryTitle}'],
  alternates: { canonical: 'https://${domain}/leads/${country}' },
};

const FAQ_ITEMS = [
  { q: 'How do I find B2B leads in ${countryTitle}?', a: 'Search ${this.domainToName(domain)} for any industry or city in ${countryTitle}. Live results with email, phone, and WhatsApp in seconds.' },
  { q: 'Are WhatsApp numbers available for ${countryTitle}?', a: 'Yes. ${this.domainToName(domain)} auto-detects WhatsApp numbers for ${countryTitle} contacts.' },
];

export default function Page() {
  return (
    <>
      <FAQSchema items={FAQ_ITEMS} />
      <main>
        <h1>B2B Lead Finder for ${countryTitle} — Real-Time Verified Contacts</h1>
        <p>Discover B2B leads across ${countryTitle} instantly via ${this.domainToName(domain)}'s live multi-source engine.</p>
        <section>
          <h2>Frequently Asked Questions</h2>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}><h3>{item.q}</h3><p>{item.a}</p></div>
          ))}
        </section>
      </main>
    </>
  );
}
`;
  }

  // ─── SCHEMA COMPONENT ────────────────────────────────────────────────

  private generateSchemaComponent(domain: string): GeneratedFile {
    return {
      path: 'src/components/seo/SchemaOrg.tsx',
      content: `// Auto-generated by Veltro SEO Hunter — do not edit manually
export function SoftwareAppSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "${this.domainToName(domain)}",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "url": "https://${domain}",
    "description": "Real-time B2B lead intelligence platform covering 40+ African countries and global markets.",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "inLanguage": ["en", "fr"],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

export function FAQSchema({ items }: { items: { q: string; a: string }[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": items.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": { "@type": "Answer", "text": item.a }
    }))
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
`,
    };
  }

  // ─── SITEMAP ADDITIONS ───────────────────────────────────────────────

  private generateSitemapAdditions(domain: string, opportunities: OpportunityCluster[]): GeneratedFile {
    const slugs = new Set<string>();
    for (const opp of opportunities) {
      for (const slug of opp.codePagesNeeded) slugs.add(slug);
    }

    const entries = [...slugs].map(slug =>
      `  <url>\n    <loc>https://${domain}${slug}</loc>\n    <priority>0.8</priority>\n  </url>`
    ).join('\n');

    return {
      path: 'public/sitemap-veltro-additions.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!-- Veltro SEO Hunter additions — merge into your main sitemap.xml -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`,
    };
  }

  // ─── INSTALL GUIDE ───────────────────────────────────────────────────

  private generateInstallGuide(
    domain: string,
    files: GeneratedFile[],
    cycleDate: Date,
    opportunities: OpportunityCluster[],
  ): GeneratedFile {
    const pages = files.filter(f => f.path.includes('page.tsx'));
    const traffic = opportunities.reduce((s, o) => s + o.estimatedMonthlyTraffic, 0);
    const critical = opportunities.filter(o => o.priority === 'critical');

    return {
      path: 'INSTALL.md',
      content: `# Veltro SEO Fix — ${cycleDate.toISOString().split('T')[0]}
## Domain: ${domain}

**${pages.length} pages generated · ~${traffic.toLocaleString()} est. visits/mo · ${critical.length} critical clusters**

---

## STEP 1 — Copy all files

Copy every file from this ZIP into your repository root, preserving folder structure.
Nothing overwrites existing files except \`src/components/seo/SchemaOrg.tsx\`.

---

## STEP 2 — Merge sitemap

Open \`public/sitemap.xml\` and paste the \`<url>\` entries from
\`public/sitemap-veltro-additions.xml\` before the closing \`</urlset>\` tag.

---

## STEP 3 — Add schema to layout.tsx

\`\`\`tsx
import { SoftwareAppSchema } from '@/components/seo/SchemaOrg';
// Inside <head>:
<SoftwareAppSchema />
\`\`\`

---

## STEP 4 — Deploy & submit

\`\`\`bash
git add .
git commit -m "feat: Veltro SEO cycle ${cycleDate.toISOString().split('T')[0]}"
git push origin main
\`\`\`

Then submit new URLs to Google Search Console:
${pages.map(f => `- https://${domain}/${f.path.replace('src/app', '').replace('/page.tsx', '')}`).join('\n')}

---

## Pages in this cycle

${pages.map(f => {
  const slug = f.path.replace('src/app', '').replace('/page.tsx', '');
  const opp = opportunities.find(o => o.codePagesNeeded.some(p => p === slug));
  return `### \`${slug}\`
- Pillar keyword: **${opp?.pillarKeyword ?? slug}**
- Cluster score: ${opp?.clusterScore ?? '-'}
- KD: ${opp?.avgKD ?? '-'}
- Est. visits/mo: ${opp?.estimatedMonthlyTraffic ?? '-'}
`;
}).join('\n')}

---

Questions? Contact: raykuate@gmail.com
Generated by Veltro SEO Hunter v2 · Jiogue LLC
`,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────

  private toTitleCase(str: string): string {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  private domainToName(domain: string): string {
    return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  }
}
