/* =====================================================================
   tracking.js
   Tracking 頁的面板控制。
   Panel control for the Tracking page.

   1. CSS Rankings 面板：第一次打開時才載入 css.html（iframe），
      並隱藏 iframe 裡的導覽列；關閉後保留狀態，再打開不重新載入。
      CSS Rankings panel: css.html is loaded into the iframe on first open
      and its navbar is hidden; the state is kept when the panel closes.
   2. 網址 hash（#six、#gene、#voc、#css）直接開啟對應面板，例如首頁右側
      的功能圖卡連到 tracking.html#voc。
      A URL hash (#six, #gene, #voc, #css) opens that panel directly, e.g. the
      feature cards on the home page link to tracking.html#voc.
   ===================================================================== */


/* ---------- 1. CSS Rankings 面板 / CSS Rankings panel ---------- */
(function () {
  var panel  = document.getElementById('cssPanel');
  var iframe = document.getElementById('cssPanelIframe');
  if (!panel || !iframe) return;

  var loaded = false;

  // css.html 也能單獨開啟，所以自己有導覽列；放在面板裡時把它藏起來
  // css.html can also be opened on its own and has a navbar; hide it inside the panel
  function hideIframeNavbar() {
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      var header = doc.querySelector('header.fixed-top');
      if (header) header.style.display = 'none';
      var main = doc.querySelector('main');
      if (main) main.style.paddingTop = '0';
      if (doc.body) doc.body.style.paddingTop = '0';
    } catch (e) {}
  }

  panel.addEventListener('show.bs.offcanvas', function () {
    if (loaded) return;
    iframe.addEventListener('load', hideIframeNavbar);
    iframe.src = '/css.html';
    loaded = true;
  });
})();


/* ---------- 2. 網址 hash 開啟面板 / Open a panel from the URL hash ---------- */
(function () {
  // hash → 面板 id / hash → panel id
  var HASH_TO_PANEL = {
    '#six':  'six',
    '#gene': 'gene',
    '#voc':  'voc',
    '#css':  'cssPanel'
  };

  // 記錄哪個面板是「從首頁帶 hash 進來時自動打開的」
  // Remembers which panel was opened automatically from a link on the home page
  var openedFromIndex = null;

  // 頁面載入時，有 hash 就打開對應面板
  // On page load, open the panel named in the hash
  window.addEventListener('DOMContentLoaded', function () {
    var id = HASH_TO_PANEL[window.location.hash];
    var el = id && document.getElementById(id);
    if (!el) return;
    openedFromIndex = id;
    bootstrap.Offcanvas.getOrCreateInstance(el).show();
  });

  Object.keys(HASH_TO_PANEL).forEach(function (hash) {
    var id = HASH_TO_PANEL[hash];
    var el = document.getElementById(id);
    if (!el) return;

    // 打開面板時，網址加上對應的 hash（方便分享連結）
    // Add the hash to the URL when a panel opens (handy for sharing)
    el.addEventListener('show.bs.offcanvas', function () {
      history.replaceState(null, '', hash);
    });

    el.addEventListener('hide.bs.offcanvas', function () {
      // 從首頁點進來的面板：關閉後回到首頁
      // Opened from the home page: go back to the home page on close
      if (openedFromIndex === id) {
        location.href = '/index.html';
        return;
      }
      // 在 Tracking 頁自己打開的面板：只清掉 hash，留在本頁
      // Opened on this page: just clear the hash and stay here
      history.replaceState(null, '', window.location.pathname);
    });
  });
})();