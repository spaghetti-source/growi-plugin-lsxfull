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

function stripLsxfullBlocks(body: string): string {
  return body.replace(/```lsxfull\n[\s\S]*?```/g, '').trim();
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
  if (/^[0-9a-f]{24}$/.test(pathname)) {
    const res = await fetch(`/_api/v3/page?pageId=${pathname}`, { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      const path = data.page?.path;
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

  const listRes = await fetch(
    `/_api/v3/pages/list?path=${encodeURIComponent(basePath)}&limit=200`,
    fetchOpts,
  );
  if (!listRes.ok) return `<p style="color:#c00">lsxfull: failed to list pages (${listRes.status})</p>`;

  const listJson = await listRes.json() as { pages: PageItem[] };
  let pages = listJson.pages || [];

  if (depth > 0) {
    const baseDepth = basePath.split('/').filter(Boolean).length;
    pages = pages.filter((p: PageItem) => {
      const pageDepth = p.path.split('/').filter(Boolean).length;
      return pageDepth - baseDepth <= depth;
    });
  }

  // Exclude the current page itself from results
  pages = pages.filter((p: PageItem) => p.path !== basePath);

  pages.sort((a: PageItem, b: PageItem) => a.path.localeCompare(b.path));
  if (reverse) pages.reverse();

  if (pages.length === 0) return '<p><em>No subpages found.</em></p>';

  let html = '';
  for (const page of pages) {
    const detailRes = await fetch(`/_api/v3/page?pageId=${page._id}`, fetchOpts);
    if (!detailRes.ok) continue;
    const detailJson = await detailRes.json() as PageDetail;
    const rawBody = detailJson.page.revision?.body || '';
    const body = stripLsxfullBlocks(stripFrontmatter(rawBody));
    const label = page.path.split('/').pop() || page.path;
    const renderedBody = marked.parse(body) as string;

    html += `<h2><a href="${escapeHtml(page.path)}">${escapeHtml(label)}</a></h2>`;
    html += renderedBody;
  }
  return html;
}

export function renderInto(el: HTMLElement, code: string): void {
  const opts = parseOptions(code);
  fetchContent(opts).then((html) => {
    // Strategy A: restyle parent pre to look like normal content
    const pre = el.closest('pre') as HTMLElement | null;
    if (pre) {
      pre.style.cssText = 'all:unset;display:block;';
    }

    // Strategy B: replace pre entirely with a plain div
    // (Applied simultaneously — if A works visually, B is redundant but harmless)
    if (pre && pre.parentElement) {
      const wrapper = document.createElement('div');
      wrapper.className = 'lsxfull-content';
      wrapper.innerHTML = html;
      pre.replaceWith(wrapper);
    } else {
      // Fallback: just set innerHTML on our element
      el.style.cssText = 'all:unset;display:block;';
      el.innerHTML = html;
    }
  }).catch((err) => {
    el.innerHTML = `<p style="color:#c00">lsxfull: ${escapeHtml(String(err))}</p>`;
  });
}
