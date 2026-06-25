import { Injectable, Logger } from '@nestjs/common';

export interface InternalLinkSuggestion {
  fromUrl:     string;
  toUrl:       string;
  anchorText:  string;
  contextSentence: string;   // the sentence where link should be inserted
  estimatedAuthorityGain: number;  // 0-100
  reason:      string;
}

export interface InternalLinkPatch {
  // For CMS autopatch: the exact HTML change needed
  url:         string;
  findText:    string;    // text to find in page content
  replaceWith: string;    // same text wrapped in <a href="...">
  autoApply:   boolean;
}

@Injectable()
export class InternalLinksService {
  private readonly logger = new Logger(InternalLinksService.name);

  // Given site pages and their keywords, suggest optimal internal links
  buildLinkMap(
    pages: { url: string; topKeyword: string; content?: string }[],
    targetUrl: string,
    targetKeyword: string,
  ): InternalLinkSuggestion[] {
    const suggestions: InternalLinkSuggestion[] = [];

    for (const page of pages) {
      if (page.url === targetUrl) continue;
      // Check if this page's content mentions the target keyword
      if (page.content && page.content.toLowerCase().includes(targetKeyword.toLowerCase())) {
        suggestions.push({
          fromUrl:    page.url,
          toUrl:      targetUrl,
          anchorText: targetKeyword,
          contextSentence: this.findContext(page.content, targetKeyword),
          estimatedAuthorityGain: this.estimateGain(page.url, targetUrl),
          reason: `"${page.topKeyword}" page mentions "${targetKeyword}" but doesn't link to your dedicated page — adding this link passes authority directly`,
        });
      }
      // Also suggest even if not mentioned — by keyword relevance
      else if (this.areRelated(page.topKeyword, targetKeyword)) {
        suggestions.push({
          fromUrl:    page.url,
          toUrl:      targetUrl,
          anchorText: targetKeyword,
          contextSentence: '',
          estimatedAuthorityGain: this.estimateGain(page.url, targetUrl) * 0.6,
          reason: `"${page.topKeyword}" is semantically related to "${targetKeyword}" — a contextual link between them strengthens both pages`,
        });
      }
    }

    return suggestions.sort((a, b) => b.estimatedAuthorityGain - a.estimatedAuthorityGain).slice(0, 5);
  }

  // Generate exact HTML patches for CMS auto-apply
  generatePatches(suggestions: InternalLinkSuggestion[]): InternalLinkPatch[] {
    return suggestions
      .filter(s => s.contextSentence)
      .map(s => ({
        url:         s.fromUrl,
        findText:    s.anchorText,
        replaceWith: `<a href="${s.toUrl}">${s.anchorText}</a>`,
        autoApply:   s.estimatedAuthorityGain > 40,
      }));
  }

  private findContext(content: string, keyword: string): string {
    const idx = content.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) return '';
    const start = Math.max(0, idx - 80);
    const end   = Math.min(content.length, idx + keyword.length + 80);
    return '...' + content.slice(start, end) + '...';
  }

  private estimateGain(fromUrl: string, toUrl: string): number {
    // Higher gain: from home/pillar pages; lower: from thin/leaf pages
    const fromDepth = (fromUrl.match(/\//g) ?? []).length;
    return Math.max(20, 80 - fromDepth * 10);
  }

  private areRelated(kw1: string, kw2: string): boolean {
    const w1 = new Set(kw1.toLowerCase().split(/\s+/));
    const w2 = kw2.toLowerCase().split(/\s+/);
    return w2.some(w => w.length > 4 && w1.has(w));
  }
}
