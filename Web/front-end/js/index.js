/* =====================================================================
   index.js
   首頁左側的報導文章卡片：讀取 doc/index.json，依序產生每一張卡片。
   Builds the article cards on the left of the home page from doc/index.json.

   index.json 每一筆的欄位 / Fields of each entry in index.json
     Title_en / Title                英文標題 / 中文標題   English / Chinese title
     Description_en / Description    英文摘要 / 中文摘要   English / Chinese summary
     Image                           卡片圖片路徑          image path
     URL                             文章頁路徑            article page path
     Timestamp                       卡片底部的日期        date in the card footer
     Author_en / Author              英文作者 / 中文作者   English / Chinese author (card footer)
     count                           排序用，數字大的排前面 sort key, larger first
   沒有 _en 欄位時，兩種語言都顯示中文原文。
   When an _en field is missing, the Chinese text is shown in both languages.

   樣式在 index.css（.article-card、.article-img）。
   Styles are in index.css (.article-card, .article-img).
   ===================================================================== */
(function () {

  // 產生中英雙語的文字（由 i18n.js 決定顯示哪一個）
  // Bilingual text; i18n.js decides which one is shown
  function bi(en, zh) {
    if (!en) return zh ?? '';
    return `<span data-l="en">${en}</span><span data-l="zh">${zh ?? en}</span>`;
  }

  // 一張文章卡片的 HTML；偶數筆用深色卡片，奇數筆用白色卡片
  // HTML for one article card; even entries are dark, odd entries are white
  function cardHTML(item) {
    const dark = item.count % 2 === 0;
    const cardClass = dark ? 'bg-dark text-light' : 'bg-white';
    const buttonClass = dark ? 'btn-light' : 'btn-outline-dark';

    return `
      <div class="row mb-4">
        <div class="container-fluid">
          <div class="card article-card ${cardClass}">
            <div class="d-flex flex-column flex-xl-row align-items-center justify-content-between">
              <img src="${item.Image}" alt="" class="article-img rounded w-100 mx-auto d-block mb-2 mb-xl-0 me-xl-3">
              <div class="card-body">
                <h2 class="card-title"><strong>${bi(item.Title_en, item.Title)}</strong></h2>
                <br>
                <h5 class="card-text text-justify">${bi(item.Description_en, item.Description)}</h5>
                <br>
                <a href="${item.URL}" class="btn ${buttonClass} btn-md">${bi('Read More...', '閱讀全文...')}</a>
              </div>
            </div>
            <div class="card-footer text-body-secondary bg-light">
              ${item.Timestamp} · ${bi(item.Author_en, item.Author)}
            </div>
          </div>
        </div>
      </div>`;
  }

  // 讀取文章清單；cache: 'no-cache' 讓瀏覽器每次都向伺服器確認有沒有更新
  // Load the article list; 'no-cache' makes the browser check the server for updates
  fetch('doc/index.json', { cache: 'no-cache' })
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById('cardContainer');
      if (!container) return;

      data
        .sort((a, b) => b.count - a.count)
        .forEach(item => container.insertAdjacentHTML('beforeend', cardHTML(item)));
    })
    .catch(err => console.error('index.json failed to load:', err));
})();