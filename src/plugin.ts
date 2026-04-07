import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

interface GrowiNode {
  name: string;
  type: string;
  attributes: Record<string, string>;
  children: unknown[];
  value: string;
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

interface PageListResponse {
  pages: PageItem[];
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

async function renderLsxFull(el: HTMLElement): Promise<void> {
  const depth = parseInt(el.dataset.depth || '1', 10);
  const reverse = el.dataset.reverse === 'true';
  const pathAttr = el.dataset.path || '';

  // Determine base path
  let basePath: string;
  if (pathAttr === '.' || pathAttr === '') {
    // Use current page path from URL
    basePath = decodeURIComponent(window.location.pathname);
  } else if (pathAttr.startsWith('/')) {
    basePath = pathAttr;
  } else {
    // Relative path
    const currentPath = decodeURIComponent(window.location.pathname);
    basePath = currentPath.replace(/\/$/, '') + '/' + pathAttr;
  }

  const fetchOpts: RequestInit = { credentials: 'same-origin' };

  try {
    console.log('[lsxfull] fetching list for', basePath);
    const listRes = await fetch(`/_api/v3/pages/list?path=${encodeURIComponent(basePath)}&limit=200`, fetchOpts);
    if (!listRes.ok) {
      el.innerHTML = `<p style="color:red">lsxfull: failed to list pages (${listRes.status})</p>`;
      return;
    }
    const listJson = await listRes.json() as { pages: PageItem[] };
    let pages = listJson.pages || [];
    console.log('[lsxfull] found', pages.length, 'pages');

    // Filter by depth
    if (depth > 0) {
      const baseDepth = basePath.split('/').filter(Boolean).length;
      pages = pages.filter((p: PageItem) => {
        const pageDepth = p.path.split('/').filter(Boolean).length;
        return pageDepth - baseDepth <= depth;
      });
      console.log('[lsxfull] after depth filter:', pages.length, 'pages');
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
      console.log('[lsxfull] fetching detail for', page.path, page._id);
      const detailRes = await fetch(`/_api/v3/page?pageId=${page._id}`, fetchOpts);
      console.log('[lsxfull] detail response:', detailRes.status);
      if (!detailRes.ok) continue;
      const detailJson = await detailRes.json() as PageDetail;
      const rawBody = detailJson.page.revision?.body || '';
      const body = stripFrontmatter(rawBody);
      const label = page.path.split('/').pop() || page.path;
      console.log('[lsxfull] page', label, 'body length:', body.length);

      html += `<div class="lsxfull-entry" style="margin-bottom:1.5em;border-bottom:1px solid #eee;padding-bottom:1em;">`;
      html += `<h3 style="margin:0 0 0.5em;"><a href="${escapeHtml(page.path)}">${escapeHtml(label)}</a></h3>`;
      html += `<div class="lsxfull-body" style="white-space:pre-wrap;font-size:0.95em;">${escapeHtml(body)}</div>`;
      html += `</div>`;
    }
    el.innerHTML = html;
  } catch (err) {
    console.error('[lsxfull] error:', err);
    el.innerHTML = `<p style="color:red">lsxfull: ${escapeHtml(String(err))}</p>`;
  }
}

export const plugin: Plugin = function () {
  console.log('[lsxfull] remark plugin initialized');
  return (tree) => {
    console.log('[lsxfull] visiting tree');
    visit(tree, (node) => {
      const n = node as unknown as GrowiNode;
      if (n.type === 'leafGrowiPluginDirective') {
        console.log('[lsxfull] found directive:', n.name, n.type, JSON.stringify(n.attributes));
      }
      if (n.type !== 'leafGrowiPluginDirective' || n.name !== 'lsxfull') return;

      console.log('[lsxfull] matched lsxfull directive');
      const attrs = n.attributes || {};
      // First positional arg is the path (stored as a key with empty value)
      const positionalKeys = Object.keys(attrs).filter(k => attrs[k] === '' || attrs[k] == null);
      const path = positionalKeys[0] || '.';
      const depth = attrs.depth || '1';
      const reverse = attrs.reverse === 'true' ? 'true' : 'false';

      const uid = `lsxfull-${Math.random().toString(36).substring(2, 10)}`;
      console.log('[lsxfull] creating element', uid);

      // Use hName/hProperties so remark-rehype creates a real DOM element
      (n as any).data = {
        hName: 'div',
        hProperties: {
          id: uid,
          'data-path': path,
          'data-depth': depth,
          'data-reverse': reverse,
          style: 'padding:1em;background:#f9f9f9;border-radius:4px;',
        },
        hChildren: [{ type: 'text', value: `[lsxfull v1.0.1] Loading path="${path}"...` }],
      };

      // Use MutationObserver to detect when element appears in DOM
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((_mutations, obs) => {
          const el = document.getElementById(uid);
          if (el) {
            obs.disconnect();
            console.log('[lsxfull] element found via MutationObserver');
            renderLsxFull(el);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Fallback timeout
        setTimeout(() => {
          observer.disconnect();
          const el = document.getElementById(uid);
          if (el && el.textContent?.includes('Loading')) {
            console.log('[lsxfull] fallback timeout, calling renderLsxFull');
            renderLsxFull(el);
          }
        }, 5000);
      }
    });
  };
};
