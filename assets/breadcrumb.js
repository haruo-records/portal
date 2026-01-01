/*!
 * breadcrumb.js
 * - URLパスから階層リンクを自動生成
 * - 現ページ名はH1優先
 * - 任意: 中間階層の表示名を「各階層の index.html の H1 / meta[name=breadcrumb]」から取得
 */

(function () {
  const nav = document.querySelector('[data-breadcrumb]');
  if (!nav) return;

  // -------------------------
  // Config
  // -------------------------
  const opts = {
    // GitHub Pages（project pages）で repo名がパス先頭に入るケースを自動判定
    basePath: nav.getAttribute('data-breadcrumb-base') || autoDetectBasePath(),
    // 中間階層の index.html をfetchしてH1で表示名を取る（重いならfalseでOK）
    resolveIntermediates: (nav.getAttribute('data-breadcrumb-resolve') || 'true') !== 'false',
    // ルート表示名（任意）
    rootLabel: nav.getAttribute('data-breadcrumb-rootlabel') || 'Home',
  };

  // -------------------------
  // Helpers
  // -------------------------
  function autoDetectBasePath() {
    // 例:
    // - https://<user>.github.io/<repo>/...  => "/<repo>/"
    // - https://<custom-domain>/...         => "/"
    const host = location.hostname;
    const parts = location.pathname.split('/').filter(Boolean);

    // GitHub Pagesらしいホストで、かつ先頭セグメントが存在するなら "/<repo>/" をベースにする
    if (host.endsWith('github.io') && parts.length >= 1) {
      return '/' + parts[0] + '/';
    }
    return '/';
  }

  function normalizeBase(base) {
    if (!base.startsWith('/')) base = '/' + base;
    if (!base.endsWith('/')) base += '/';
    return base;
  }

  function slugToLabel(slug) {
    // "cosmic-colored" -> "Cosmic Colored"
    // "voltfoot" -> "Voltfoot"
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function getCurrentTitle() {
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();

    const meta = document.querySelector('meta[name="breadcrumb"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content').trim();

    if (document.title && document.title.trim()) return document.title.trim();
    return 'Current';
  }

  async function fetchTitleFromIndex(url) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return null;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const meta = doc.querySelector('meta[name="breadcrumb"]');
      if (meta && meta.getAttribute('content')) return meta.getAttribute('content').trim();

      const h1 = doc.querySelector('h1');
      if (h1 && h1.textContent.trim()) return h1.textContent.trim();

      const t = doc.querySelector('title');
      if (t && t.textContent.trim()) return t.textContent.trim();

      return null;
    } catch (e) {
      return null;
    }
  }

  function buildCrumbs(pathname, basePath) {
    basePath = normalizeBase(basePath);

    // pathnameから basePath を差し引いた “相対階層” を作る
    let p = pathname;

    // ファイル名がある場合は落とす（/a/b.html -> /a/）
    if (/\.[a-zA-Z0-9]+$/.test(p)) {
      p = p.replace(/[^/]+$/, '');
    }

    // basePathより前は無視
    if (p.startsWith(basePath)) {
      p = p.slice(basePath.length);
    } else {
      // まれにbasePath推定が外れた時の保険
      p = p.replace(/^\/+/, '');
    }

    const segments = p.split('/').filter(Boolean);

    // ルート（basePath自体）
    const crumbs = [
      {
        label: opts.rootLabel,
        url: basePath,
        isCurrent: segments.length === 0,
        slug: '',
      },
    ];

    let acc = basePath;
    segments.forEach((seg, i) => {
      acc += seg + '/';
      crumbs.push({
        label: slugToLabel(seg), // 一旦slug整形（後で解決可能なら上書き）
        url: acc,
        isCurrent: i === segments.length - 1,
        slug: seg,
      });
    });

    return crumbs;
  }

  function render(crumbs) {
    const ol = document.createElement('ol');
    ol.className = 'breadcrumb';

    crumbs.forEach((c) => {
      const li = document.createElement('li');

      if (c.isCurrent) {
        const span = document.createElement('span');
        span.textContent = c.label;
        span.setAttribute('aria-current', 'page');
        li.appendChild(span);
      } else {
        const a = document.createElement('a');
        a.href = c.url;
        a.textContent = c.label;
        li.appendChild(a);
      }

      ol.appendChild(li);
    });

    nav.innerHTML = '';
    nav.appendChild(ol);
  }

  // -------------------------
  // Main
  // -------------------------
  (async function main() {
    const basePath = normalizeBase(opts.basePath);
    const crumbs = buildCrumbs(location.pathname, basePath);

    // 現ページ名はH1優先で確定（末尾crumb）
    if (crumbs.length > 0) {
      crumbs[crumbs.length - 1].label = getCurrentTitle();
    }

    // 中間階層の表示名も index.html から引く（任意）
    if (opts.resolveIntermediates && crumbs.length > 2) {
      // crumbs[0] はHome、末尾はCurrentなので、その間だけ解決
      const targets = crumbs.slice(1, -1);

      await Promise.all(
        targets.map(async (c) => {
          // その階層のindex.htmlからタイトルを引く
          const indexUrl = new URL('index.html', location.origin + c.url).toString();
          const title = await fetchTitleFromIndex(indexUrl);
          if (title) c.label = title;
        })
      );
    }

    render(crumbs);
  })();
})();
