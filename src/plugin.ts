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

  try {
    const listRes = await fetch(`/_api/v3/pages/list?path=${encodeURIComponent(basePath)}&limit=200`);
    if (!listRes.ok) {
      el.innerHTML = `<p style="color:red">lsxfull: failed to list pages (${listRes.status})</p>`;
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
      const detailRes = await fetch(`/_api/v3/page?pageId=${page._id}`);
      if (!detailRes.ok) continue;
      const detailJson = await detailRes.json() as PageDetail;
      const rawBody = detailJson.page.revision?.body || '';
      const body = stripFrontmatter(rawBody);
      const label = page.path.split('/').pop() || page.path;

      html += `<div class="lsxfull-entry" style="margin-bottom:1.5em;border-bottom:1px solid #eee;padding-bottom:1em;">`;
      html += `<h3 style="margin:0 0 0.5em;"><a href="${escapeHtml(page.path)}">${escapeHtml(label)}</a></h3>`;
      html += `<div class="lsxfull-body" style="white-space:pre-wrap;font-size:0.95em;">${escapeHtml(body)}</div>`;
      html += `</div>`;
    }
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = `<p style="color:red">lsxfull: ${escapeHtml(String(err))}</p>`;
  }
}

export const plugin: Plugin = function () {
  return (tree) => {
    visit(tree, (node) => {
      const n = node as unknown as GrowiNode;
      if (n.type !== 'leafGrowiPluginDirective' || n.name !== 'lsxfull') return;

      const attrs = n.attributes || {};
      // First positional arg is the path (stored as a key with empty value)
      const positionalKeys = Object.keys(attrs).filter(k => attrs[k] === '' || attrs[k] == null);
      const path = positionalKeys[0] || '.';
      const depth = attrs.depth || '1';
      const reverse = attrs.reverse === 'true' ? 'true' : 'false';

      const uid = Math.random().toString(36).substring(2, 10);
      n.type = 'html';
      n.value = `<div id="lsxfull-${uid}" data-path="${escapeHtml(path)}" data-depth="${escapeHtml(depth)}" data-reverse="${reverse}">Loading subpages...</div>`;

      // Schedule async rendering via polling for DOM element
      const intervalId = setInterval(() => {
        const el = document.getElementById(`lsxfull-${uid}`);
        if (el) {
          clearInterval(intervalId);
          renderLsxFull(el);
        }
      }, 100);
    });
  };
};
