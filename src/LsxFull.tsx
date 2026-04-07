import { marked } from 'marked';

interface PageItem {
  _id: string;
  path: string;
}

interface PageDetail {
  page: {
    path: string;
    revision?: {
      body?: string;
    };
  };
}

function parseOptions(code: string): Record<string, string> {
  const opts: Record<string, string> = {};
  for (const line of code.trim().split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      opts[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();
    }
  }
  return opts;
}

function stripFrontmatter(body: string): string {
  if (!body.startsWith('---')) return body;
  const parts = body.split('---', 3);
  if (parts.length >= 3) return parts[2].trim();
  return body;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function resolveCurrentPagePath(): Promise<string> {
  const pathname = decodeURIComponent(window.location.pathname).replace(/^\//, '');
  console.log('[lsxfull] resolveCurrentPagePath, pathname:', pathname, 'isObjectId:', /^[0-9a-f]{24}$/.test(pathname));
  if (/^[0-9a-f]{24}$/.test(pathname)) {
    const res = await fetch(`/_api/v3/page?pageId=${pathname}`, { credentials: 'same-origin' });
    console.log('[lsxfull] page resolve response:', res.status);
    if (res.ok) {
      const data = await res.json();
      const path = data.page?.path;
      console.log('[lsxfull] resolved to path:', path);
      if (path) return path;
    }
  }
  return '/' + pathname;
}

async function fetchContent(opts: Record<string, string>): Promise<string> {
  const pathAttr = opts.path || '.';
  const depth = parseInt(opts.depth || '1', 10);
  const reverse = opts.reverse === 'true';
  const fetchOpts: RequestInit = { credentials: 'same-origin' };

  let basePath: string;
  if (pathAttr === '.' || pathAttr === '') {
    basePath = await resolveCurrentPagePath();
  } else if (pathAttr.startsWith('/')) {
    basePath = pathAttr;
  } else {
    const currentPath = await resolveCurrentPagePath();
    basePath = currentPath.replace(/\/$/, '') + '/' + pathAttr;
  }

  const listUrl = `/_api/v3/pages/list?path=${encodeURIComponent(basePath)}&limit=200`;
  console.log('[lsxfull] fetching list:', listUrl);
  const listRes = await fetch(listUrl, fetchOpts);
  console.log('[lsxfull] list response:', listRes.status);
  if (!listRes.ok) return `<p style="color:#c00">lsxfull: failed to list pages (${listRes.status})</p>`;

  const listJson = await listRes.json() as { pages: PageItem[] };
  let pages = listJson.pages || [];
  console.log('[lsxfull] total pages from API:', pages.length, 'paths:', pages.map((p: PageItem) => p.path));

  if (depth > 0) {
    const baseDepth = basePath.split('/').filter(Boolean).length;
    pages = pages.filter((p: PageItem) => {
      const pageDepth = p.path.split('/').filter(Boolean).length;
      return pageDepth - baseDepth <= depth;
    });
  }

  pages.sort((a: PageItem, b: PageItem) => a.path.localeCompare(b.path));
  if (reverse) pages.reverse();

  if (pages.length === 0) return '<p><em>No subpages found.</em></p>';

  let html = '';
  for (const page of pages) {
    const detailRes = await fetch(`/_api/v3/page?pageId=${page._id}`, fetchOpts);
    if (!detailRes.ok) continue;
    const detailJson = await detailRes.json() as PageDetail;
    const rawBody = detailJson.page.revision?.body || '';
    const body = stripFrontmatter(rawBody);
    const label = page.path.split('/').pop() || page.path;
    const renderedBody = marked.parse(body) as string;

    html += `<h2><a href="${escapeHtml(page.path)}">${escapeHtml(label)}</a></h2>`;
    html += renderedBody;
  }
  return html;
}

/**
 * Populate an element with lsxfull content.
 * Called from the component override — no React dependency needed.
 */
export function renderInto(el: HTMLElement, code: string): void {
  console.log('[lsxfull] renderInto called, code:', code.substring(0, 100));
  const opts = parseOptions(code);
  console.log('[lsxfull] parsed options:', JSON.stringify(opts));
  fetchContent(opts).then((html) => {
    console.log('[lsxfull] fetchContent resolved, html length:', html.length, 'preview:', html.substring(0, 100));
    el.innerHTML = html;
  }).catch((err) => {
    console.error('[lsxfull] fetchContent error:', err);
    el.innerHTML = `<p style="color:#c00">lsxfull: ${escapeHtml(String(err))}</p>`;
  });
}
