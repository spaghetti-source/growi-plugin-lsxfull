import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { marked } from 'marked';

interface GrowiNode {
  name: string;
  type: string;
  attributes: Record<string, string>;
  children: unknown[];
  value: string;
  data?: Record<string, unknown>;
}

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripFrontmatter(body: string): string {
  if (!body.startsWith('---')) return body;
  const parts = body.split('---', 3);
  if (parts.length >= 3) return parts[2].trim();
  return body;
}

async function resolveCurrentPagePath(): Promise<string> {
  const pathname = decodeURIComponent(window.location.pathname).replace(/^\//, '');

  // Growi URLs use page IDs (24 hex chars) — resolve to actual path
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

async function renderLsxFull(el: HTMLElement): Promise<void> {
  const depth = parseInt(el.dataset.depth || '1', 10);
  const reverse = el.dataset.reverse === 'true';
  const pathAttr = el.dataset.path || '';
  const fetchOpts: RequestInit = { credentials: 'same-origin' };

  // Resolve base path
  let basePath: string;
  if (pathAttr === '.' || pathAttr === '') {
    basePath = await resolveCurrentPagePath();
  } else if (pathAttr.startsWith('/')) {
    basePath = pathAttr;
  } else {
    const currentPath = await resolveCurrentPagePath();
    basePath = currentPath.replace(/\/$/, '') + '/' + pathAttr;
  }

  try {
    // List subpages
    const listRes = await fetch(
      `/_api/v3/pages/list?path=${encodeURIComponent(basePath)}&limit=200`,
      fetchOpts,
    );
    if (!listRes.ok) {
      el.innerHTML = `<p style="color:#c00">lsxfull: failed to list pages (${listRes.status})</p>`;
      return;
    }
    const listJson = await listRes.json() as { pages: PageItem[] };
    let pages = listJson.pages || [];

    // Filter by depth
    if (depth > 0) {
      const baseDepth = basePath.split('/').filter(Boolean).length;
      pages = pages.filter((p: PageItem) => {
        const pageDepth = p.path.split('/').filter(Boolean).length;
        return pageDepth - baseDepth <= depth;
      });
    }

    // Sort by path
    pages.sort((a: PageItem, b: PageItem) => a.path.localeCompare(b.path));
    if (reverse) pages.reverse();

    if (pages.length === 0) {
      el.innerHTML = '<p><em>No subpages found.</em></p>';
      return;
    }

    // Fetch and render each page
    let html = '';
    for (const page of pages) {
      const detailRes = await fetch(`/_api/v3/page?pageId=${page._id}`, fetchOpts);
      if (!detailRes.ok) {
        console.warn('[lsxfull] failed to fetch', page.path, detailRes.status);
        continue;
      }
      const detailJson = await detailRes.json() as PageDetail;
      const rawBody = detailJson.page.revision?.body || '';
      const body = stripFrontmatter(rawBody);
      const label = page.path.split('/').pop() || page.path;
      const renderedBody = marked.parse(body) as string;

      html += `<div style="margin-bottom:1.5em;border-bottom:1px solid #e0e0e0;padding-bottom:1em;">`;
      html += `<h3 style="margin:0 0 0.5em;"><a href="${escapeHtml(page.path)}">${escapeHtml(label)}</a></h3>`;
      html += `<div style="font-size:0.95em;">${renderedBody}</div>`;
      html += `</div>`;
    }
    el.innerHTML = html;
  } catch (err) {
    console.error('[lsxfull] error:', err);
    el.innerHTML = `<p style="color:#c00">lsxfull: ${escapeHtml(String(err))}</p>`;
  }
}

export const plugin: Plugin = function () {
  return (tree) => {
    visit(tree, (node) => {
      const n = node as unknown as GrowiNode;
      if (n.type !== 'leafGrowiPluginDirective' || n.name !== 'lsxfull') return;

      const attrs = n.attributes || {};
      const positionalKeys = Object.keys(attrs).filter(k => attrs[k] === '' || attrs[k] == null);
      const path = positionalKeys[0] || '.';
      const depth = attrs.depth || '1';
      const reverse = attrs.reverse === 'true' ? 'true' : 'false';

      const uid = `lsxfull-${Math.random().toString(36).substring(2, 10)}`;

      // Replace node content — clear children/value to prevent directive text from rendering
      n.children = [];
      (n as any).value = '';

      // Use hName/hProperties so remark-rehype creates a real DOM element
      n.data = {
        hName: 'div',
        hProperties: {
          id: uid,
          'data-path': path,
          'data-depth': depth,
          'data-reverse': reverse,
        },
        hChildren: [{ type: 'text', value: 'Loading...' }],
      };

      // Detect element in DOM via MutationObserver, then render
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((_mutations, obs) => {
          const el = document.getElementById(uid);
          if (el) {
            obs.disconnect();
            renderLsxFull(el);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          const el = document.getElementById(uid);
          if (el && el.textContent?.includes('Loading')) {
            renderLsxFull(el);
          }
        }, 5000);
      }
    });
  };
};
