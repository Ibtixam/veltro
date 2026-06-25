// ─── VELTRO STACK ADAPTER SYSTEM ─────────────────────────────────────────
//
// THE PROBLEM:
// A Next.js developer needs a .tsx file with React metadata exports.
// A WordPress owner needs a .php template file + WP-CLI command.
// A Webflow user needs a JSON payload for the CMS API — no code at all.
// A static HTML site needs a plain .html file with inline schema tags.
// A Wix or Squarespace user needs instructions — no code can be deployed.
//
// If you give a WordPress site a TSX file, it's useless.
// If you give a Next.js dev a PHP file, it's wrong.
// If you give a Wix user any file, they can't use it.
//
// THE SOLUTION:
// 1. StackDetectorService fetches the customer's domain and fingerprints
//    it from HTTP headers, HTML body patterns, and URL signals.
//    Confidence 0-100%. Falls back to 'html' if uncertain.
//
// 2. AdapterRouter maps the detected stack to the right adapter class.
//    Each adapter implements this interface — same input, different output.
//
// 3. CodeGeneratorService calls AdapterRouter.getAdapter(signal)
//    and generates the package. Customer always gets something they can use.
//
// RESULT: Veltro works regardless of what stack the customer built on.
// The ZIP contents change. The delivery does not.

export interface PageInput {
  domain:     string;
  slug:       string;      // e.g. /solutions/b2b-leads-africa
  keyword:    string;
  title:      string;
  lang:       'en' | 'fr';
  faq:        { q: string; a: string }[];
  satellites: string[];
  schemaType: 'FAQPage' | 'HowTo' | 'Article' | 'Dataset';
  content:    string;      // prose content (stack-agnostic)
  images:     { url: string; alt: string }[];
  internalLinks: { anchor: string; href: string }[];
}

export interface GeneratedFile {
  path:        string;
  content:     string;
  description: string;
}

export interface AdapterOutput {
  files:        GeneratedFile[];
  installSteps: string[];   // plain English, numbered
  notes:        string[];   // adapter-specific caveats
  canAutoDeploy: boolean;   // whether AutoDeployService can handle this stack
  autoDeployMethod?: 'github_pr' | 'cms_api' | 'manual_only';
}

export abstract class BaseAdapter {
  abstract readonly stackName:  string;
  abstract readonly fileExt:    string;
  abstract readonly canAutoDeploy: boolean;
  abstract readonly autoDeployMethod: AdapterOutput['autoDeployMethod'];

  abstract generatePage(input: PageInput): GeneratedFile;
  abstract generateSchemaHelper(domain: string): GeneratedFile;
  abstract generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile;
  abstract getInstallSteps(domain: string, files: GeneratedFile[]): string[];

  protected slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  protected title(s: string) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
  protected domainName(d: string) { const n = d.split('.')[0]; return n.charAt(0).toUpperCase() + n.slice(1); }

  protected buildFAQSchemaJSON(faq: { q: string; a: string }[]): string {
    return JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    }, null, 2);
  }
}
