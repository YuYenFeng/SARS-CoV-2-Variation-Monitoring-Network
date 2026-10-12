/* =====================================================================
   word_country.js
   Tracking 頁的互動世界地圖，以及點選國家後跳出的 2×2 圖表視窗。
   Interactive world map on the Tracking page and the 2×2 chart modal that
   opens when a country (or Global View) is clicked.

   依賴 / Depends on
     - Bootstrap 5（modal）
     - Chart.js、jsPDF
     - six_type.js、genomic_variation.js、voc.js 提供的繪圖函式
       Drawing functions from six_type.js, genomic_variation.js and voc.js:
       updateChart()（world1）、renderGeneChart()（world2）、
       drawSeries1()（world3）、drawSeries2()（world4）
     - image/World_map_configurable.svg（Wikimedia Commons）

   樣式 / Styles
     地圖顏色、hover、放大縮小鍵、圖表遮罩的樣式都在 tracking.css。
     Map colours, hover, zoom buttons and chart overlays are styled in tracking.css.

   流程 / Sections
      1. 載入 SVG                         Load the SVG
      2. 放進頁面、等比縮放               Insert into the page, keep aspect ratio
      3. 國界 shape → 國家名稱            Map each border shape to a country
      4. 有資料的國家與名稱對應           Countries with data, name aliases
      5. Tooltip 與 hover                 Tooltip and hover
      6. hover / click 事件               Hover / click events
      7. 放大、縮小、拖曳                 Zoom and pan
      8. 下載與列印（四圖合成 2×2）       Download / print the 2×2 panel
      9. 四張圖共用設定                   Shared chart settings
     10. 無資料顯示                       No-data state
     11. 圖表尺寸                         Chart sizing
     12. 共用時間軸、欄位對齊、標題       Shared time axis, alignment, titles
     13. Genomic 小圖前 10 名             Genomic chart: top 10 variations
     14. 開啟國家視窗並繪製四張圖         Open the country modal and draw the charts
   ===================================================================== */

// 頁面載入完成後建立地圖 / Build the map once the page has loaded
document.addEventListener("DOMContentLoaded", function () {
  create_world_map();
});

async function create_world_map() {
  const container = document.getElementById('svg-container');
  const tooltip   = document.getElementById('svgTooltip');
  if (!container) { console.error('#svg-container not found'); return; }

  /* =====================================================
     1. 載入 SVG / Load the SVG
  ===================================================== */
  let svgHTML;
  try {
    const res = await fetch('image/World_map_configurable.svg');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    svgHTML = await res.text();
  } catch (err) {
    console.error('Failed to load world map SVG:', err);
    container.innerHTML = '<p class="text-danger">Failed to load the world map.</p>';
    return;
  }

  /* =====================================================
     2. 插入 SVG 到容器 / Insert the SVG into the container
  ===================================================== */
  container.innerHTML = svgHTML;
  const svgEl = container.querySelector('svg');
  if (!svgEl) { console.error('SVG element not found after inject'); return; }

  // ── 等比縮放設定 / Keep the original aspect ratio ──────
  const origW = parseFloat(svgEl.getAttribute('width'))  || 2756;
  const origH = parseFloat(svgEl.getAttribute('height')) || 1399;

  if (!svgEl.getAttribute('viewBox')) {
    svgEl.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
  }
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // ── 外層容器固定長寬比，hover 時版面不會跳動 ──────────
  // Fixed-ratio wrapper so the layout does not jump on hover.
  // 尺寸與定位寫在 tracking.css 的 .map-wrap。
  // Size and position are defined by .map-wrap in tracking.css.
  const mapWrap = document.createElement('div');
  mapWrap.className = 'map-wrap';

  container.removeChild(svgEl);
  mapWrap.appendChild(svgEl);
  container.appendChild(mapWrap);

  svgEl.setAttribute('width',  '100%');
  svgEl.setAttribute('height', '100%');

  /* =====================================================
     3. 建立「實際國界 shape → 國家」對應
        Map each real border shape to its country
     只有真正畫出國界的 path / circle / polygon / use 會接收滑鼠事件，不用 <g>
     的外框，避免大國的外框蓋住鄰國（樣式在 tracking.css）。
     Only real border shapes receive mouse events (not the <g> bounding box),
     so a large country never covers its neighbours (styles in tracking.css).
  ===================================================== */
  const clickableRegions = [];
  const clickableSeen = new Set();
  const countryShapes = new Map();

  function canonicalCountryName(countryName) {
    const raw = String(countryName ?? '').trim();
    if (!raw) return '';

    // Hong Kong 在不同版本的 SVG 可能寫成 Hong_Kong / Hong-Kong /
    // Hong Kong SAR / HKG / HK。畫面與 API 一律統一成 Hong Kong。
    const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      compact === 'hk' || compact === 'hkg' ||
      compact === 'hongkong' ||
      compact.startsWith('hongkongsar') ||
      compact.startsWith('hongkongspecialadministrativeregion')
    ) {
      return 'Hong Kong';
    }

    // United Kingdom：地圖檔可能拆成 England / Scotland / Wales / Northern Ireland，
    // 或寫成 UK / GB / Great Britain。全部併成同一個國家，hover 時整個英國一起變色。
    if ([
      'unitedkingdom', 'unitedkingdomofgreatbritainandnorthernireland',
      'uk', 'gb', 'gbr', 'greatbritain', 'britain',
      'england', 'scotland', 'wales', 'northernireland',
    ].includes(compact)) {
      return 'United Kingdom';
    }

    return raw;
  }

  function registerCountryShape(shape, countryName) {
    if (!shape || !countryName) return;
    const name = canonicalCountryName(countryName);
    if (!name) return;

    shape.setAttribute('data-map-country', name);
    shape.classList.add('map-country-shape');

    if (!countryShapes.has(name)) countryShapes.set(name, []);
    const list = countryShapes.get(name);
    if (!list.includes(shape)) list.push(shape);

    if (!clickableSeen.has(shape)) {
      clickableSeen.add(shape);
      clickableRegions.push({ el: shape, name });
    }
  }

  function ownTitleText(el) {
    if (!el) return '';
    const titleEl = [...el.children].find(child =>
      child.tagName && child.tagName.toLowerCase() === 'title'
    );
    return titleEl?.textContent?.trim() || '';
  }

  // A) 本身已有 name 的實際幾何圖形。
  svgEl.querySelectorAll('path[name], circle[name], polygon[name], use[name]').forEach(shape => {
    registerCountryShape(shape, shape.getAttribute('name'));
  });

  // A2) Taiwan 專用 fallback。
  // 原始 World_map_configurable.svg 的 Taiwan 可能只有 .land.tw，
  // 不一定有 name="Taiwan" 或自己的 <title>。如果不額外註冊，
  // 它會被上面的 pointer-events:none 排除，造成不能 hover / click。
  function registerTaiwanNode(node) {
    if (!node) return;

    const tag = String(node.tagName || '').toLowerCase();
    if (['path', 'circle', 'polygon', 'use'].includes(tag)) {
      registerCountryShape(node, 'Taiwan');
      return;
    }

    // 若 .tw 在 <g> 上，只讓真正可見的子 shape 接事件；
    // 不把 <g> 本身當 hit target，避免再次出現 bounding-box 蓋住鄰國。
    node.querySelectorAll?.('path, circle, polygon, use').forEach(shape => {
      registerCountryShape(shape, 'Taiwan');
    });
  }

  svgEl.querySelectorAll('.land.tw, .tw').forEach(registerTaiwanNode);

  // 額外保險：若 SVG 使用 id="TW" / id="tw" 標 Taiwan，也註冊。
  ['TW', 'tw', 'Taiwan', 'taiwan'].forEach(id => {
    const node = svgEl.getElementById ? svgEl.getElementById(id) : svgEl.querySelector(`#${id}`);
    if (node) registerTaiwanNode(node);
  });

  // B) path/circle/polygon.land 沒有 name，但自己的 <title> 有國名。
  svgEl.querySelectorAll('path.land, circle.land, polygon.land').forEach(shape => {
    if (shape.hasAttribute('data-map-country')) return;
    const name = shape.getAttribute('name') || ownTitleText(shape);
    if (name) registerCountryShape(shape, name);
  });

  // C) g.land 代表一個國家時，不再讓 <g> 自己接事件；
  //    把國名灌到 group 裡真正可見的幾何 shape，避免 bounding box 蓋住其他國家。
  svgEl.querySelectorAll('g.land').forEach(group => {
    const groupName = group.getAttribute('name') || ownTitleText(group);
    if (!groupName) return;

    group.querySelectorAll('path, circle, polygon, use').forEach(shape => {
      // 若內層 shape 已有更明確的國名，保留它；否則使用 group 國名。
      const existing = shape.getAttribute('data-map-country') || shape.getAttribute('name');
      registerCountryShape(shape, existing || groupName);
    });
  });

  // D0) United Kingdom 專用 fallback：若英國只用 id / class 標示（gb、uk），沒有 name 或 title。
  ['.land.gb', '.gb', '#gb', '#GB', '.land.uk', '.uk', '#uk', '#UK'].forEach(selector => {
    try {
      svgEl.querySelectorAll(selector).forEach(node => {
        const tag = String(node.tagName || '').toLowerCase();
        if (['path', 'circle', 'polygon', 'use'].includes(tag)) {
          registerCountryShape(node, 'United Kingdom');
        } else {
          node.querySelectorAll('path, circle, polygon, use').forEach(shape =>
            registerCountryShape(shape, 'United Kingdom'));
        }
      });
    } catch {}
  });

  // D) Hong Kong 專用 fallback。
  // 有些 World_map_configurable.svg 不把 Hong Kong 當獨立 country path，
  // 或只留下 hk / HKG / Hong_Kong 之類的 id/class，所以一般規則抓不到。
  function registerHongKongNode(node) {
    if (!node) return;

    const tag = String(node.tagName || '').toLowerCase();
    if (['path', 'circle', 'polygon', 'use'].includes(tag)) {
      registerCountryShape(node, 'Hong Kong');
      return;
    }

    node.querySelectorAll?.('path, circle, polygon, use').forEach(shape => {
      registerCountryShape(shape, 'Hong Kong');
    });
  }

  // 常見的 id / class / name 形式。
  const hongKongSelectors = [
    '.land.hk', '.hk', '.land.hkg', '.hkg',
    '#HK', '#hk', '#HKG', '#hkg',
    '[name="Hong Kong"]', '[name="Hong_Kong"]', '[name="Hong-Kong"]',
    '[name="HongKong"]', '[name="Hong Kong SAR"]', '[name="Hong Kong S.A.R."]',
    '[id="Hong Kong"]', '[id="Hong_Kong"]', '[id="Hong-Kong"]', '[id="HongKong"]'
  ];

  hongKongSelectors.forEach(selector => {
    try {
      svgEl.querySelectorAll(selector).forEach(registerHongKongNode);
    } catch {}
  });

  // 也檢查 <title>Hong Kong...</title>，其 parent 可能是 <g>。
  svgEl.querySelectorAll('title').forEach(titleEl => {
    const title = canonicalCountryName(titleEl.textContent || '');
    if (title === 'Hong Kong') registerHongKongNode(titleEl.parentElement);
  });

  // 如果原 SVG 完全沒有 Hong Kong 的獨立 shape，就利用 Taiwan 的位置建立
  // 一個小型透明 hotspot。Hong Kong 約在 Taiwan 西南方，這只負責 hover/click
  // hit area，不改變地圖本身的國界繪圖。
  if (!countryShapes.has('Hong Kong') && countryShapes.has('Taiwan')) {
    const taiwanShapes = countryShapes.get('Taiwan') || [];
    const boxes = taiwanShapes.map(shape => {
      try { return shape.getBBox(); } catch { return null; }
    }).filter(box => box && box.width >= 0 && box.height >= 0);

    if (boxes.length) {
      const minX = Math.min(...boxes.map(b => b.x));
      const minY = Math.min(...boxes.map(b => b.y));
      const maxX = Math.max(...boxes.map(b => b.x + b.width));
      const maxY = Math.max(...boxes.map(b => b.y + b.height));
      const twCx = (minX + maxX) / 2;
      const twCy = (minY + maxY) / 2;

      const vb = svgEl.viewBox?.baseVal;
      const mapW = vb?.width || origW || 2756;
      const mapH = vb?.height || origH || 1399;

      // 約 6.5° 經度向西、1.5° 緯度向南。
      const hkCx = twCx - mapW * (6.5 / 360);
      const hkCy = twCy + mapH * (1.5 / 180);
      const radius = Math.max(7, Math.min(12, mapW * 0.0035));

      const hotspot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hotspot.setAttribute('cx', String(hkCx));
      hotspot.setAttribute('cy', String(hkCy));
      hotspot.setAttribute('r', String(radius));
      hotspot.setAttribute('aria-label', 'Hong Kong');
      hotspot.classList.add('map-country-hotspot');
      svgEl.appendChild(hotspot);
      registerCountryShape(hotspot, 'Hong Kong');
    }
  }

  /* =====================================================
     4. 有資料的國家 / Countries with data
     - AVAILABLE_COUNTRIES：資料庫中的國家名稱（點擊時送出的名稱）
       Country names in the database (sent to the API on click)
     - SVG 的國名寫法可能不同，用 normalize + 別名對應
       SVG names may differ, so they are normalised and matched with aliases
  ===================================================== */
  const AVAILABLE_COUNTRIES = [
    'Afghanistan', 'Albania', 'Algeria', 'American Samoa', 'Andorra',
    'Angola', 'Anguilla', 'Antigua and Barbuda', 'Argentina', 'Armenia',
    'Aruba', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas',
    'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium',
    'Belize', 'Benin', 'Bermuda', 'Bhutan', 'Bolivia',
    'Bonaire', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'British Virgin Islands',
    'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde',
    'Cambodia', 'Cameroon', 'Canada', 'Canary Islands', 'Cayman Islands',
    'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia',
    'Comoros', 'Cook Islands', 'Costa Rica', 'Cote dIvoire', 'Crimea',
    'Croatia', 'Cuba', 'Curacao', 'Cyprus', 'Czech Republic',
    'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
    'Donetsk', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea',
    'Estonia', 'Eswatini', 'Ethiopia', 'Faroe Islands', 'Fiji',
    'Finland', 'France', 'French Guiana', 'French Polynesia', 'Gabon',
    'Gambia', 'Georgia', 'Germany', 'Ghana', 'Gibraltar',
    'Greece', 'Grenada', 'Guadeloupe', 'Guam', 'Guatemala',
    'Guinea', 'Guinea Bissau', 'Guyana', 'Haiti', 'Honduras',
    'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia',
    'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
    'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya',
    'Kherson Region', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan',
    'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia',
    'Libya', 'Liechtenstein', 'Lithuania', 'Lugansk', 'Luxembourg',
    'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali',
    'Malta', 'Marshall Islands', 'Martinique', 'Mauritania', 'Mauritius',
    'Mayotte', 'Mexico', 'Micronesia', 'Moldova', 'Monaco',
    'Mongolia', 'Montenegro', 'Montserrat', 'Morocco', 'Mozambique',
    'Myanmar', 'Namibia', 'Nepal', 'Netherlands', 'New Caledonia',
    'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'Niue',
    'North Macedonia', 'Northern Mariana Islands', 'Norway', 'Oman', 'Pakistan',
    'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay',
    'Peru', 'Philippines', 'Poland', 'Portugal', 'Puerto Rico',
    'Qatar', 'Republic of the Congo', 'Reunion', 'Romania', 'Russia',
    'Rwanda', 'Saint Barthelemy', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Martin',
    'Saint Vincent and the Grenadines', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia',
    'Seychelles', 'Sierra Leone', 'Singapore', 'Sint Eustatius', 'Sint Maarten',
    'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa',
    'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'St Lucia',
    'Sudan', 'Sultanate of Oman', 'Suriname', 'Sweden', 'Switzerland',
    'Syria', 'Taiwan', 'Tanzania', 'Thailand', 'The Bahamas',
    'Timor Leste', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago',
    'Tunisia', 'Turkey', 'Turks and Caicos Islands', 'Uganda', 'Ukraine',
    'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
    'Vanuatu', 'Venezuela', 'Vietnam', 'Wallis and Futuna', 'Wallis and Futuna Islands',
    'Zambia', 'Zaporizhzhia Region', 'Zimbabwe',
  ];

  function normCountry(name) {
    return String(name ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  }

  const availableByNorm = new Map();
  AVAILABLE_COUNTRIES.forEach(n => {
    const k = normCountry(n);
    if (!availableByNorm.has(k)) availableByNorm.set(k, n);
  });

  // SVG 常見寫法 → 資料庫名稱
  const COUNTRY_ALIASES = {
    'United States of America': 'United States', 'USA': 'United States', 'US': 'United States',
    'Czechia': 'Czech Republic',
    "Côte d'Ivoire": 'Cote dIvoire', 'Ivory Coast': 'Cote dIvoire',
    'Cape Verde': 'Cabo Verde',
    'Swaziland': 'Eswatini', 'Kingdom of Eswatini': 'Eswatini',
    'Macedonia': 'North Macedonia', 'Republic of Macedonia': 'North Macedonia',
    'Former Yugoslav Republic of Macedonia': 'North Macedonia',
    'East Timor': 'Timor-Leste',
    'Korea': 'South Korea', 'Republic of Korea': 'South Korea', 'Korea, Republic of': 'South Korea',
    'Russian Federation': 'Russia',
    'DR Congo': 'Democratic Republic of the Congo', 'DRC': 'Democratic Republic of the Congo',
    'Congo, Democratic Republic of the': 'Democratic Republic of the Congo',
    'Congo-Kinshasa': 'Democratic Republic of the Congo',
    'Congo': 'Republic of the Congo', 'Congo-Brazzaville': 'Republic of the Congo',
    'Burma': 'Myanmar',
    'Lao PDR': 'Laos', "Lao People's Democratic Republic": 'Laos',
    'The Gambia': 'Gambia',
    'Guinea-Bissau': 'Guinea Bissau',
    'Brunei Darussalam': 'Brunei',
    'Syrian Arab Republic': 'Syria',
    'Iran, Islamic Republic of': 'Iran', 'Islamic Republic of Iran': 'Iran',
    'Türkiye': 'Turkey', 'Turkiye': 'Turkey',
    'State of Palestine': 'Palestine', 'Palestinian Territories': 'Palestine',
    'West Bank': 'Palestine', 'Gaza': 'Palestine', 'Gaza Strip': 'Palestine',
    'Federated States of Micronesia': 'Micronesia', 'Micronesia, Federated States of': 'Micronesia',
    'United Republic of Tanzania': 'Tanzania',
    'Bolivia, Plurinational State of': 'Bolivia',
    'Venezuela, Bolivarian Republic of': 'Venezuela',
    'Republic of Moldova': 'Moldova', 'Moldova, Republic of': 'Moldova',
    'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
    'UK': 'United Kingdom', 'Great Britain': 'United Kingdom',
    "People's Republic of China": 'China',
    'Republic of China': 'Taiwan',
    'Kyrgyz Republic': 'Kyrgyzstan',
    'Slovak Republic': 'Slovakia',
    'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
    'Viet Nam': 'Vietnam',
    'St. Kitts and Nevis': 'Saint Kitts and Nevis',
    'St. Vincent and the Grenadines': 'Saint Vincent and the Grenadines',
    'Kingdom of the Netherlands': 'Netherlands',
  };
  const aliasByNorm = new Map(
    Object.entries(COUNTRY_ALIASES).map(([k, v]) => [normCountry(k), v])
  );

  // 地圖名稱 → 資料庫名稱；沒有資料回傳 null
  function resolveDataCountry(mapName) {
    const k = normCountry(mapName);
    if (availableByNorm.has(k)) return availableByNorm.get(k);
    const alias = aliasByNorm.get(k);
    if (alias && availableByNorm.has(normCountry(alias))) {
      return availableByNorm.get(normCountry(alias));
    }
    return null;
  }

  const dataCountryByMapName = new Map();
  countryShapes.forEach((shapes, mapName) => {
    const dataName = resolveDataCountry(mapName);
    if (dataName) dataCountryByMapName.set(mapName, dataName);
    shapes.forEach(shape =>
      shape.classList.toggle('map-country-available', Boolean(dataName))
    );
  });

  function isAvailableCountry(mapName) {
    return dataCountryByMapName.has(mapName);
  }

  function tooltipLabel(mapName) {
    return isAvailableCountry(mapName)
      ? dataCountryByMapName.get(mapName)
      : `${mapName} — ${(window.L || ((e) => e))('No data', '無資料')}`;
  }

  /* =====================================================
     5. Tooltip + 精確 hover / Tooltip and precise hover
  ===================================================== */
  let hoveredCountry = null;

  function getCountryShape(node) {
    let cur = node instanceof Element ? node : null;
    while (cur && cur !== svgEl) {
      if (cur.classList?.contains('map-country-shape') && cur.hasAttribute('data-map-country')) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function setHoveredCountry(countryName) {
    if (countryName && !isAvailableCountry(countryName)) countryName = null;
    if (hoveredCountry === countryName) return;

    if (hoveredCountry && countryShapes.has(hoveredCountry)) {
      countryShapes.get(hoveredCountry).forEach(shape =>
        shape.classList.remove('map-country-hover')
      );
    }

    hoveredCountry = countryName || null;

    if (hoveredCountry && countryShapes.has(hoveredCountry)) {
      countryShapes.get(hoveredCountry).forEach(shape =>
        shape.classList.add('map-country-hover')
      );
    }
  }

  function showTooltip(e, text) {
    if (!tooltip) return;
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    moveTooltip(e);
  }

  function moveTooltip(e) {
    if (!tooltip) return;
    tooltip.style.left = (e.pageX + 12) + 'px';
    tooltip.style.top  = (e.pageY + 12) + 'px';
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.style.display = 'none';
  }

  /* =====================================================
     6. 用 SVG event delegation 處理 hover / click
        Hover and click handled by one listener on the SVG
     - 事件只會命中真正的國家 shape / only real country shapes are hit
     - 同國家的多個 path / 離島一起 highlight
       All parts of a country (islands etc.) are highlighted together
  ===================================================== */
  svgEl.addEventListener('pointerover', e => {
    if (mapDrag?.moved) return;
    const shape = getCountryShape(e.target);
    if (!shape) return;

    const country = shape.getAttribute('data-map-country');
    const fromShape = getCountryShape(e.relatedTarget);
    const fromCountry = fromShape?.getAttribute('data-map-country') || null;

    if (country !== fromCountry) {
      setHoveredCountry(country);
      showTooltip(e, tooltipLabel(country));
    }
  });

  svgEl.addEventListener('pointermove', e => {
    if (mapDrag?.moved) return;
    const shape = getCountryShape(e.target);
    if (!shape) return;

    const country = shape.getAttribute('data-map-country');
    if (isAvailableCountry(country) && hoveredCountry !== country) {
      setHoveredCountry(country);
      showTooltip(e, tooltipLabel(country));
    } else {
      moveTooltip(e);
    }
  });

  svgEl.addEventListener('pointerout', e => {
    const shape = getCountryShape(e.target);
    if (!shape) return;

    const country = shape.getAttribute('data-map-country');
    const toShape = getCountryShape(e.relatedTarget);
    const toCountry = toShape?.getAttribute('data-map-country') || null;

    // 從同一國家的其中一塊 path 移到另一塊時，不要閃爍。
    if (country === toCountry) return;

    if (!toCountry) {
      setHoveredCountry(null);
      hideTooltip();
    } else {
      setHoveredCountry(toCountry);
      showTooltip(e, tooltipLabel(toCountry));
    }
  });

  /* =====================================================
     7. 放大 / 縮小 / 拖曳平移 / Zoom and pan
     - 右側 + / − / 重設 按鈕，改變 SVG viewBox
       The + / − / reset buttons on the right change the SVG viewBox
     - 放大後可按住拖曳移動地圖；拖曳結束不會誤觸開啟國家
       When zoomed in, drag to pan; ending a drag never opens a country
  ===================================================== */
  const baseVB = (() => {
    const vb = svgEl.viewBox?.baseVal;
    return {
      x: vb?.x || 0,
      y: vb?.y || 0,
      w: vb?.width  || origW,
      h: vb?.height || origH,
    };
  })();
  const ZOOM_MIN = 1, ZOOM_MAX = 8, ZOOM_STEP = 1.5;
  let mapZoom = 1;
  let viewCx = baseVB.x + baseVB.w / 2;
  let viewCy = baseVB.y + baseVB.h / 2;
  let mapDrag = null;
  let suppressMapClick = false;

  const zoomCtl = document.createElement('div');
  zoomCtl.className = 'map-zoom';
  zoomCtl.setAttribute('role', 'group');
  zoomCtl.setAttribute('aria-label', 'Map zoom');

  function makeZoomBtn(html, label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = html;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClick);
    zoomCtl.appendChild(btn);
    return btn;
  }

  const zoomInBtn  = makeZoomBtn('+', (window.L || ((e) => e))('Zoom in', '放大'),  () => setMapZoom(mapZoom * ZOOM_STEP));
  const zoomOutBtn = makeZoomBtn('&minus;', (window.L || ((e) => e))('Zoom out', '縮小'), () => setMapZoom(mapZoom / ZOOM_STEP));
  const zoomResetBtn = makeZoomBtn(
    '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/></svg>',
    (window.L || ((e) => e))('Reset view', '重設檢視'),
    () => {
      mapZoom = 1;
      viewCx = baseVB.x + baseVB.w / 2;
      viewCy = baseVB.y + baseVB.h / 2;
      applyMapView();
    }
  );
  // 放在地圖區（.map-stage）右側 / Placed on the right of the map area
  (container.closest('.map-stage') || mapWrap).appendChild(zoomCtl);

  function applyMapView() {
    const w = baseVB.w / mapZoom;
    const h = baseVB.h / mapZoom;
    viewCx = Math.min(Math.max(viewCx, baseVB.x + w / 2), baseVB.x + baseVB.w - w / 2);
    viewCy = Math.min(Math.max(viewCy, baseVB.y + h / 2), baseVB.y + baseVB.h - h / 2);
    svgEl.setAttribute('viewBox', `${viewCx - w / 2} ${viewCy - h / 2} ${w} ${h}`);

    mapWrap.classList.toggle('map-zoomed', mapZoom > 1);
    zoomInBtn.disabled    = mapZoom >= ZOOM_MAX;
    zoomOutBtn.disabled   = mapZoom <= ZOOM_MIN;
    zoomResetBtn.disabled = mapZoom <= ZOOM_MIN;
  }

  function setMapZoom(next) {
    mapZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    if (mapZoom < 1.01) mapZoom = 1;
    applyMapView();
  }

  svgEl.addEventListener('pointerdown', e => {
    if (mapZoom <= 1 || e.button !== 0) return;
    mapDrag = { x: e.clientX, y: e.clientY, cx: viewCx, cy: viewCy, moved: false };
  });

  window.addEventListener('pointermove', e => {
    if (!mapDrag) return;
    const dx = e.clientX - mapDrag.x;
    const dy = e.clientY - mapDrag.y;
    if (!mapDrag.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      mapDrag.moved = true;
      mapWrap.classList.add('map-dragging');
      hideTooltip();
      setHoveredCountry(null);
    }
    // preserveAspectRatio = meet：螢幕像素 → viewBox 單位
    const rect = svgEl.getBoundingClientRect();
    const scale = Math.min(rect.width / (baseVB.w / mapZoom), rect.height / (baseVB.h / mapZoom));
    viewCx = mapDrag.cx - dx / scale;
    viewCy = mapDrag.cy - dy / scale;
    applyMapView();
  });

  window.addEventListener('pointerup', () => {
    if (!mapDrag) return;
    if (mapDrag.moved) {
      suppressMapClick = true;
      setTimeout(() => { suppressMapClick = false; }, 0);
    }
    mapWrap.classList.remove('map-dragging');
    mapDrag = null;
  });

  applyMapView();

  svgEl.addEventListener('click', e => {
    if (suppressMapClick) return;
    const shape = getCountryShape(e.target);
    if (!shape) return;

    const country = shape.getAttribute('data-map-country');
    if (!country || !isAvailableCountry(country)) return;

    hideTooltip();
    setHoveredCountry(null);
    openCountryModal(dataCountryByMapName.get(country));
  });

  // Global View 按鈕：開啟全球的四張圖 / Global View button opens the worldwide charts
  const globalBtn = document.getElementById('country_global');
  if (globalBtn) {
    globalBtn.addEventListener('click', () => openCountryModal('Global'));
  }

  /* =====================================================
     8. 下載 & 列印（四圖合成 2×2）
        Download / print: the four charts are combined into one 2×2 image
  ===================================================== */
  function getFourCharts() {
    return ['world1', 'world2', 'world3', 'world4']
      .map(id => document.getElementById(id))
      .filter(Boolean);
  }

  function drawCanvasIntoTile(ctx, srcCanvas, x, y, tileW, tileH) {
    if (!srcCanvas) return;
    const sw = srcCanvas.width, sh = srcCanvas.height;
    if (!sw || !sh) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, tileW, tileH);
    const scale = Math.min(tileW / sw, tileH / sh);
    const dw = Math.floor(sw * scale), dh = Math.floor(sh * scale);
    const dx = x + Math.floor((tileW - dw) / 2);
    const dy = y + Math.floor((tileH - dh) / 2);
    ctx.drawImage(srcCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
  }

  async function composeFourCharts() {
    await new Promise(r => requestAnimationFrame(r));
    const canvases = getFourCharts();
    if (!canvases.length) throw new Error('No charts found.');

    const maxW    = Math.max(...canvases.map(c => c.width  || 0));
    const maxH    = Math.max(...canvases.map(c => c.height || 0));
    const padding = 24, gap = 24, cols = 2, rows = 2;
    const outW = padding * 2 + maxW * cols + gap * (cols - 1);
    const outH = padding * 2 + maxH * rows + gap * (rows - 1);

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);

    canvases.slice(0, 4).forEach((c, i) => {
      const r   = Math.floor(i / cols);
      const col = i % cols;
      drawCanvasIntoTile(
        ctx, c,
        padding + col * (maxW + gap),
        padding + r   * (maxH + gap),
        maxW, maxH
      );
    });
    return out;
  }

  async function downloadFourAsImage(type = 'image/png', filename = 'country_panel_2x2.png') {
    const composed = await composeFourCharts();
    const a = document.createElement('a');
    a.download = filename;
    a.href = composed.toDataURL(type);
    a.click();
  }

  async function downloadFourAsPDF(filename = 'country_panel_2x2.pdf') {
    const composed = await composeFourCharts();
    const imgData  = composed.toDataURL('image/png');
    const pdf      = new jspdf.jsPDF(
      composed.width >= composed.height ? 'landscape' : 'portrait', 'pt', 'a4'
    );
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const scale = Math.min(pageW / composed.width, pageH / composed.height);
    pdf.addImage(
      imgData, 'PNG',
      (pageW - composed.width  * scale) / 2,
      (pageH - composed.height * scale) / 2,
      composed.width  * scale,
      composed.height * scale
    );
    pdf.save(filename);
  }

  // 下載選單綁定（只綁一次）
  let currentModalCountry = '';
  function bindCountryMenuOnce() {
    const bind = (id, fn) => {
      const btn = document.getElementById(id);
      if (btn && !btn._wmBound) {
        btn.addEventListener('click', fn);
        btn._wmBound = true;
      }
    };
    bind('printChart-country', async () => {
      const composed = await composeFourCharts();
      const win = window.open();
      win.document.write(
        `<img src="${composed.toDataURL()}" onload="window.print();window.close()">`
      );
    });
    bind('downloadPNG-country',
      () => downloadFourAsImage('image/png',  `${currentModalCountry || 'country'}_panel_2x2.png`));
    bind('downloadJPEG-country',
      () => downloadFourAsImage('image/jpeg', `${currentModalCountry || 'country'}_panel_2x2.jpg`));
    bind('downloadPDF-country',
      () => downloadFourAsPDF(`${currentModalCountry || 'country'}_panel_2x2.pdf`));
  }

  /* =====================================================
     9. 地圖四圖共用設定 / Shared settings for the four charts
     - Genomic 小圖的設定由 genomic_variation.js 決定
       Genomic chart settings are owned by genomic_variation.js
     - 四張圖使用同一條時間軸 / The four charts share one time axis
     - 缺少的日期維持空白，不補值 / Missing dates stay empty (no interpolation)
  ===================================================== */
  const COUNTRY_CHART_IDS = ['world1', 'world2', 'world3', 'world4'];
  const COUNTRY_NO_DATA_IDS = new Set();

  function getChartInstance(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    try {
      const byCanvas = window.Chart?.getChart?.(canvas);
      if (byCanvas) return byCanvas;
    } catch {}

    try {
      const byId = window.Chart?.getChart?.(canvasId);
      if (byId) return byId;
    } catch {}

    return window[canvasId] || null;
  }


  /* =====================================================
     10. 國家視窗：無資料 / Country modal: no-data state
     某張圖沒有資料時，不顯示空的座標軸，改成置中顯示「No Data / 無資料」。
     樣式在 tracking.css 的 .country-no-data。
     If a chart has no data, hide the empty axes and show a centred
     "No Data" message instead (styled by .country-no-data in tracking.css).
  ===================================================== */
  function datasetHasNumericValue(dataset) {
    if (!dataset || !Array.isArray(dataset.data)) return false;

    return dataset.data.some(point => {
      if (point === null || point === undefined || point === '') return false;

      let raw = point;
      if (typeof point === 'object' && !Array.isArray(point)) {
        raw = point.y;
      }

      if (raw === null || raw === undefined || raw === '') return false;
      return Number.isFinite(Number(raw));
    });
  }

  function chartHasMeaningfulData(canvasId) {
    const chart = getChartInstance(canvasId);
    if (!chart?.data) return false;

    // 地圖的 Genomic 小圖：只有每日樣本數不算有資料，至少要有一條變異線
    // Map Genomic chart: the daily sample size alone is not data; at least one variation line is needed
    if (canvasId === 'world2') {
      return Array.isArray(chart.$mapGenomicTop10) && chart.$mapGenomicTop10.length > 0;
    }

    const datasets = Array.isArray(chart.data.datasets) ? chart.data.datasets : [];
    if (!datasets.length) return false;

    // world1 / world3：只有每日樣本數長條、沒有頻率線時，也顯示 No Data
    // world1 / world3: show No Data when there is only the daily sample size bar and no frequency line
    const relevant = (canvasId === 'world1' || canvasId === 'world3')
      ? datasets.filter(ds => !isSampleSizeDataset(ds))
      : datasets;

    return relevant.some(datasetHasNumericValue);
  }

  function setCountryChartNoData(canvasId, noData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const wrapper = canvas.closest('.chart-cell') || canvas.parentElement;
    if (!wrapper) return;
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

    const overlayId = `no-data-${canvasId}`;
    let overlay = document.getElementById(overlayId);

    if (noData) {
      COUNTRY_NO_DATA_IDS.add(canvasId);
      canvas.style.visibility = 'hidden';

      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'country-no-data';
        overlay.textContent = (window.L || ((e) => e))('No Data', '無資料');
        wrapper.appendChild(overlay);
      } else {
        overlay.style.display = 'flex';
      }
    } else {
      COUNTRY_NO_DATA_IDS.delete(canvasId);
      canvas.style.visibility = 'visible';
      if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
    }
  }

  function refreshCountryChartNoDataStates(canvasIds = COUNTRY_CHART_IDS) {
    const dataIds = [];
    canvasIds.forEach(id => {
      const hasData = chartHasMeaningfulData(id);
      setCountryChartNoData(id, !hasData);
      if (hasData) dataIds.push(id);
    });
    return dataIds;
  }

  /* =====================================================
     11. 國家視窗：圖表尺寸 / Country modal: chart sizing
     視窗還在打開時就畫圖，Chart.js 可能抓到錯誤的寬度（例如 world4 比較窄）。
     這裡強制四張圖都使用 .chart-cell 的實際寬高，四張圖大小一致。
     Charts drawn while the modal is still opening can get the wrong width
     (e.g. world4 narrower than the others). Every chart is forced to the real
     .chart-cell size so all four are identical.
  ===================================================== */
  function forceCountryChartSize(canvasId) {
    if (COUNTRY_NO_DATA_IDS.has(canvasId)) return;

    const canvas = document.getElementById(canvasId);
    const chart  = getChartInstance(canvasId);
    if (!canvas || !chart) return;

    const cell = canvas.closest('.chart-cell');
    if (!cell) return;

    const width  = Math.max(1, Math.round(cell.clientWidth));
    const height = Math.max(1, Math.round(cell.clientHeight));

    // 清掉繪圖時留下的尺寸，大小交給 CSS 決定
    // Clear sizes left by the renderer; CSS decides the box size
    canvas.style.setProperty('width', '100%', 'important');
    canvas.style.setProperty('height', '100%', 'important');
    canvas.style.setProperty('max-width', 'none', 'important');
    canvas.style.setProperty('max-height', 'none', 'important');
    canvas.style.display = 'block';

    chart.options ||= {};
    chart.options.responsive = true;
    chart.options.maintainAspectRatio = false;

    // resize(寬, 高) 用 CSS 像素，devicePixelRatio 由 Chart.js 處理
    // resize(width, height) uses CSS pixels; Chart.js handles devicePixelRatio
    try {
      chart.resize(width, height);
    } catch (err) {
      console.warn(`[country chart] resize failed for ${canvasId}`, err);
    }

    try { chart.update('none'); }
    catch { chart.update(); }
  }

  function resizeCountryChartsToCells(canvasIds = COUNTRY_CHART_IDS) {
    canvasIds.forEach(forceCountryChartSize);
  }

  /* =====================================================
     12. 共用時間軸與欄位對齊 / Shared time axis and column alignment
     四張圖用同一段日期範圍與刻度；同一欄的兩張圖，繪圖區左右切齊。
     All four charts use the same date range and ticks; the plot areas of
     the two charts in each column line up.
  ===================================================== */
  function toDateMs(value) {
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isFinite(ms) ? ms : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 1e10) return value;
      return null;
    }

    if (typeof value !== 'string') return null;
    const s = value.trim();
    if (!s) return null;

    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }

  function dateKey(value) {
    const ms = toDateMs(value);
    if (ms === null) return null;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function collectChartDates(chart, targetSet) {
    if (!chart?.data) return;

    (chart.data.labels || []).forEach(label => {
      const key = dateKey(label);
      if (key) targetSet.add(key);
    });

    (chart.data.datasets || []).forEach(ds => {
      if (!Array.isArray(ds?.data)) return;
      ds.data.forEach(point => {
        if (!point || typeof point !== 'object' || Array.isArray(point)) return;
        const key = dateKey(point.x);
        if (key) targetSet.add(key);
      });
    });
  }

  function buildSharedTickValues(firstMs, lastMs, count = 6) {
    if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return [];
    if (lastMs <= firstMs || count <= 1) return [firstMs];

    // 四張圖使用相同、等時間間隔的刻度位置（不用各圖自動產生的刻度）
    // All four charts use the same ticks at equal time intervals (not each chart's automatic ticks)
    return Array.from({ length: count }, (_, i) => {
      if (i === 0) return firstMs;
      if (i === count - 1) return lastMs;
      return firstMs + (lastMs - firstMs) * (i / (count - 1));
    });
  }

  function formatSharedDateTick(value) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const yy = String(d.getUTCFullYear()).slice(-2);
    return `${mon} '${yy}`;
  }

  function primitiveDatasetToTimePoints(dataset, oldLabels) {
    if (!dataset || !Array.isArray(dataset.data) || !Array.isArray(oldLabels)) return;
    if (!oldLabels.length || dataset.data.length !== oldLabels.length) return;

    const keys = oldLabels.map(dateKey);
    if (!keys.every(Boolean)) return;

    const primitive = dataset.data.every(v =>
      v === null || v === undefined || ['number', 'string', 'boolean'].includes(typeof v)
    );
    if (!primitive) return;

    dataset.data = dataset.data.map((y, i) => ({ x: keys[i], y: y ?? null }));
  }

  function normalizeDatasetTimePoints(dataset) {
    if (!dataset || !Array.isArray(dataset.data)) return;
    dataset.data = dataset.data.map(point => {
      if (!point || typeof point !== 'object' || Array.isArray(point) || !('x' in point)) {
        return point;
      }
      const key = dateKey(point.x);
      return key ? { ...point, x: key } : point;
    });
    dataset.spanGaps = false;
  }

  function getPaddingObject(chart) {
    const raw = chart?.options?.layout?.padding;
    if (typeof raw === 'number') {
      return { top: raw, right: raw, bottom: raw, left: raw };
    }
    return {
      top: Number(raw?.top) || 0,
      right: Number(raw?.right) || 0,
      bottom: Number(raw?.bottom) || 0,
      left: Number(raw?.left) || 0,
    };
  }

  const COUNTRY_AXIS_GROUPS = [
    ['world1', 'world3'], // left column: top / bottom
    ['world2', 'world4'], // right column: top / bottom
  ];

  function ensureAxisBasePadding(chart) {
    if (!chart) return;
    if (!chart.$mapAxisBasePadding) {
      chart.$mapAxisBasePadding = getPaddingObject(chart);
    }
  }

  function resetAxisPadding(chart) {
    if (!chart) return;
    ensureAxisBasePadding(chart);
    chart.options ||= {};
    chart.options.layout ||= {};
    chart.options.layout.padding = { ...chart.$mapAxisBasePadding };
  }

  function alignPlotAreaGroup(ids) {
    const charts = ids
      .filter(id => !COUNTRY_NO_DATA_IDS.has(id))
      .map(id => getChartInstance(id))
      .filter(Boolean);
    if (charts.length < 2) return;

    // 每次都從原本的 padding 開始，重複開啟或縮放視窗時留白不會越來越多
    // Always start from the original padding so repeated opens or resizes do not add whitespace
    charts.forEach(chart => {
      resetAxisPadding(chart);
      try { chart.update('none'); }
      catch { chart.update(); }
    });

    // Chart.js 依 Y / Y2 刻度文字寬度預留空間；這裡反覆微調，
    // 直到同一欄上下兩張圖的繪圖區左右邊界完全一致
    // Chart.js reserves space by the Y / Y2 tick-label width; adjust repeatedly until
    // the plot areas of the two charts in a column share the same left and right edges
    for (let iteration = 0; iteration < 5; iteration++) {
      const measured = charts.map(chart => ({
        chart,
        left: chart.chartArea?.left ?? 0,
        right: chart.chartArea?.right ?? (chart.width || 0),
      }));

      const targetLeft  = Math.max(...measured.map(x => x.left));
      const targetRight = Math.min(...measured.map(x => x.right));
      let changed = false;

      measured.forEach(({ chart, left, right }) => {
        const pad = getPaddingObject(chart);
        const addLeft  = Math.max(0, targetLeft - left);
        const addRight = Math.max(0, right - targetRight);

        if (addLeft > 0.5 || addRight > 0.5) changed = true;

        chart.options.layout ||= {};
        chart.options.layout.padding = {
          ...pad,
          left: pad.left + addLeft,
          right: pad.right + addRight,
        };
      });

      if (!changed) break;
      charts.forEach(chart => {
        try { chart.update('none'); }
        catch { chart.update(); }
      });
    }
  }

  /* -----------------------------------------------------
     四張圖的標題：對應主頁四個功能的名稱與說明
     Chart titles in the modal: match the names and descriptions of the
     main features on the page.
       title    = 功能名稱 / feature name   (e.g. "Six Strain Types")
       subtitle = 圖的內容 / what the chart shows
     中文由 chart-i18n.js 依 DICT / PATTERNS 翻譯。
     Chinese text comes from DICT / PATTERNS in chart-i18n.js.
  ----------------------------------------------------- */
  function genomicSubtitle(chart) {
    const latest = chart.$mapGenomicLatestDate;
    const d = latest ? dateKey(latest) : null;
    const afMin = Number(chart.$mapGenomicAfMin);
    const afMax = Number(chart.$mapGenomicAfMax);
    const af = Number.isFinite(afMin) && Number.isFinite(afMax)
      ? `${afMin.toFixed(3)} – ${afMax.toFixed(3)}`
      : '0.250 – 0.750';
    return d
      ? `Spike protein: top 10 variations on ${d} (latest AF: ${af})`
      : `Spike protein: top 10 variations (latest AF: ${af})`;
  }

  const COUNTRY_CHART_TITLES = {
    world1: { title: 'Six Strain Types',                  subtitle: () => 'Strain type proportions and daily sample sizes' },
    world2: { title: 'Emerging Genomic Variation',        subtitle: genomicSubtitle },
    world3: { title: 'Variant of Concern (VOC) Tracking', subtitle: () => 'VOC frequencies and daily sample sizes' },
    world4: { title: 'Variant of Concern (VOC) Tracking', subtitle: () => 'Sublineage frequencies by VOC: Omicron' },
  };

  /* -----------------------------------------------------
     六型小圖的圖例：色塊大小與字級跟 VOC 圖（world3）一樣；
     順序為 Type I–VI → Others → 每日樣本數
     Six-type legend: same box size and font as the VOC chart (world3);
     order is Type I–VI → Others → daily sample size
  ----------------------------------------------------- */
  const SIX_TYPE_ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

  function sixTypeLegendRank(dataset) {
    if (isSampleSizeDataset(dataset)) return 99;            // 每日樣本數放最後
    const label = String(dataset?.label ?? '').trim();
    const m = label.match(/type\s*[-_]?\s*([ivx]+|\d+)\b/i) || label.match(/第?\s*(\d+)\s*型/);
    if (m) {
      const k = m[1].toLowerCase();
      return SIX_TYPE_ROMAN[k] ?? (Number(k) || 50);        // Type 1–6
    }
    if (/other|其他/i.test(label)) return 90;               // Others
    return 50;
  }

  function styleSixTypeLegend() {
    if (COUNTRY_NO_DATA_IDS.has('world1')) return;
    const six = getChartInstance('world1');
    if (!six) return;

    const voc = COUNTRY_NO_DATA_IDS.has('world3') ? null : getChartInstance('world3');
    const vocLab = voc?.options?.plugins?.legend?.labels || {};

    six.options ||= {};
    six.options.plugins ||= {};
    six.options.plugins.legend ||= {};
    const lab = (six.options.plugins.legend.labels ||= {});

    lab.boxWidth  = vocLab.boxWidth  ?? 12;
    lab.boxHeight = vocLab.boxHeight ?? lab.boxHeight;
    lab.padding   = vocLab.padding   ?? 8;
    lab.font      = { ...(lab.font || {}), size: vocLab.font?.size ?? 11 };
    lab.usePointStyle = vocLab.usePointStyle ?? lab.usePointStyle;
    lab.sort = (a, b, data) =>
      (sixTypeLegendRank(data.datasets[a.datasetIndex]) -
       sixTypeLegendRank(data.datasets[b.datasetIndex])) ||
      (a.datasetIndex - b.datasetIndex);

    try { six.update('none'); }
    catch { six.update(); }
  }

  function setCountryChartTitles(canvasIds = COUNTRY_CHART_IDS) {
    canvasIds.forEach(id => {
      if (COUNTRY_NO_DATA_IDS.has(id)) return;
      const chart = getChartInstance(id);
      const def = COUNTRY_CHART_TITLES[id];
      if (!chart || !def) return;

      chart.options ||= {};
      chart.options.plugins ||= {};
      chart.options.plugins.title = {
        display: true,
        text: def.title,
        color: '#0f172a',
        font: { size: 13, weight: '700' },
        padding: { top: 2, bottom: 1 },
      };
      chart.options.plugins.subtitle = {
        display: true,
        text: def.subtitle(chart),
        color: '#6c757d',
        font: { size: 11, weight: '400' },
        padding: { bottom: 6 },
      };

      try { chart.update('none'); }
      catch { chart.update(); }
    });
  }

  function synchronizeCountryChartTimeAxes(canvasIds = COUNTRY_CHART_IDS) {
    const charts = canvasIds
      .filter(id => !COUNTRY_NO_DATA_IDS.has(id))
      .map(id => ({ id, chart: getChartInstance(id) }))
      .filter(x => x.chart);

    if (!charts.length) return;

    // 1) 從四張圖所有實際日期找出共同的日期範圍
    // 1) Find one common date range from all real dates in the four charts
    const allDates = new Set();
    charts.forEach(({ chart }) => collectChartDates(chart, allDates));

    const sharedLabels = [...allDates].sort((a, b) => Date.parse(a) - Date.parse(b));
    if (!sharedLabels.length) return;

    const firstMs = Date.parse(sharedLabels[0]);
    const lastMs  = Date.parse(sharedLabels[sharedLabels.length - 1]);
    const sharedTickValues = buildSharedTickValues(firstMs, lastMs, 6);

    // 2) 四張圖都改用同一個時間軸；缺資料的日期留空，spanGaps=false 不會把線連起來
    // 2) Put every chart on the same time scale; missing dates stay empty and
    //    spanGaps=false keeps lines from bridging the gaps
    charts.forEach(({ chart }) => {
      const oldLabels = Array.isArray(chart.data?.labels) ? [...chart.data.labels] : [];

      (chart.data?.datasets || []).forEach(dataset => {
        primitiveDatasetToTimePoints(dataset, oldLabels);
        normalizeDatasetTimePoints(dataset);
      });

      // 資料點自己帶 x 值，所以不使用 labels（避免變成類別軸）
      // Data points carry their own x values, so labels are not used (no category axis)
      chart.data.labels = [];

      chart.options ||= {};
      chart.options.parsing = chart.options.parsing ?? true;
      chart.options.scales ||= {};
      chart.options.scales.x ||= {};

      const oldX = chart.options.scales.x;
      chart.options.scales.x = {
        ...oldX,
        type: 'time',
        min: firstMs,
        max: lastMs,
        bounds: 'ticks',
        offset: false,
        time: {
          ...(oldX.time || {}),
          tooltipFormat: 'yyyy-MM-dd',
        },
        ticks: {
          ...(oldX.ticks || {}),
          autoSkip: false,
          maxRotation: 0,
          minRotation: 0,
          callback: formatSharedDateTick,
        },
        // 覆寫 Chart.js 自動產生的刻度，四張圖都用同樣六個日期位置
        // Override Chart.js auto ticks so every chart uses the same six date positions
        afterBuildTicks: (axis) => {
          axis.ticks = sharedTickValues.map(value => ({ value }));
        },
      };

      (chart.data?.datasets || []).forEach(dataset => {
        dataset.spanGaps = false;
      });

      // 新圖或換國家時：記下這張圖原本的 padding，作為上下對齊的基準
      // New chart or new country: record the chart's original padding as the alignment baseline
      ensureAxisBasePadding(chart);

      try { chart.update('none'); }
      catch { chart.update(); }
    });

    // 3) 加上四張圖的標題（會影響圖的高度，所以在對齊前做）
    //    Add the chart titles first, because they change the plot height
    styleSixTypeLegend();
    setCountryChartTitles(charts.map(c => c.id));

    // 4) 依欄對齊繪圖區：即使某張圖右側 Y2 軸比較寬，同一日期在上下兩張圖也落在同一個 x 位置
    // 4) Align the plot areas by column: the same date lands on the same x pixel in the
    //    upper and lower charts, even when one chart has a wider right-side Y2 axis
    COUNTRY_AXIS_GROUPS.forEach(alignPlotAreaGroup);
  }

  /* =====================================================
     13. Genomic 小圖：最新日期的前 10 名變異
         Genomic chart: top 10 variations on the latest date
     只保留 Spike protein 在最新日期頻率最高的 10 條線，每日樣本數保留。
     Keeps the 10 Spike protein variations with the highest frequency on the
     latest date; the daily sample size is kept.
  ===================================================== */
  function datasetValueAtIndex(dataset, index) {
    if (!dataset || !Array.isArray(dataset.data) || index < 0 || index >= dataset.data.length) {
      return null;
    }

    const point = dataset.data[index];
    if (point === null || point === undefined) return null;

    let rawY = point;
    if (typeof point === 'object' && !Array.isArray(point)) {
      rawY = point.y;
    }
    if (rawY === null || rawY === undefined || rawY === '') return null;

    const y = Number(rawY);
    return Number.isFinite(y) ? y : null;
  }

  function isSampleSizeDataset(dataset) {
    const label = String(dataset?.label ?? '').trim().toLowerCase();
    const axis  = String(dataset?.yAxisID ?? '').trim().toLowerCase();
    return label.includes('sample') || label.includes('number of daily') || axis === 'y1';
  }

  function getLatestMutationIndex(chart, mutationDatasets) {
    const labels = Array.isArray(chart?.data?.labels) ? chart.data.labels : [];
    if (!labels.length || !mutationDatasets.length) return -1;

    // 所有變異都要在「同一個」最新日期比較：從最後一天往前找，
    // 第一個至少有一個變異有頻率值的日期
    // Compare all variations on the SAME latest date: walk back from the last date
    // to the first date on which at least one variation has a frequency value
    for (let i = labels.length - 1; i >= 0; i--) {
      const hasMutationData = mutationDatasets.some(ds => datasetValueAtIndex(ds, i) !== null);
      if (hasMutationData) return i;
    }
    return -1;
  }

  function enforceMapGenomicTop10(canvasId) {
    const chart = getChartInstance(canvasId);
    if (!chart?.data?.datasets) return;

    const allDatasets = [...chart.data.datasets];
    const sampleDatasets = allDatasets.filter(isSampleSizeDataset);

    // 地圖的 Genomic 小圖只看 Spike protein（Gene S）
    // The map Genomic chart uses Spike protein (Gene S) only
    const sDatasets = allDatasets.filter(dataset => {
      if (isSampleSizeDataset(dataset)) return false;
      const label = String(dataset?.label ?? '').trim();
      return /^S:/i.test(label);
    });

    const latestIndex = getLatestMutationIndex(chart, sDatasets);
    if (latestIndex < 0) {
      chart.data.datasets = sampleDatasets;
      chart.$mapGenomicLatestDate = null;
      chart.$mapGenomicTop10 = [];
      try { chart.update('none'); } catch { chart.update(); }
      return;
    }

    const latestDate = Array.isArray(chart.data.labels)
      ? chart.data.labels[latestIndex]
      : null;

    // 依同一個最新日期的頻率排序。哪些變異納入，已由 renderGeneChart 的 AF 範圍決定；
    // 這裡不再用固定 AF 範圍過濾，否則會誤刪當天頻率剛好 >75% 或 <25% 的變異
    // Rank by frequency on the same latest date. renderGeneChart's AF range already chose
    // which variations qualify; do not filter by a fixed AF range again here, or a valid
    // variation would be dropped just because its frequency that day is >75% or <25%
    const ranked = sDatasets
      .map(dataset => ({
        dataset,
        frequencyPct: datasetValueAtIndex(dataset, latestIndex),
      }))
      .filter(x => Number.isFinite(x.frequencyPct))
      .sort((a, b) => {
        const d = b.frequencyPct - a.frequencyPct;
        if (d !== 0) return d;
        return String(a.dataset?.label ?? '').localeCompare(String(b.dataset?.label ?? ''));
      })
      .slice(0, 10);

    chart.data.datasets = [
      ...sampleDatasets,
      ...ranked.map(x => x.dataset),
    ];

    chart.$mapGenomicLatestDate = latestDate;
    chart.$mapGenomicTop10 = ranked.map((x, i) => ({
      rank: i + 1,
      label: String(x.dataset?.label ?? ''),
      frequency: x.frequencyPct,
    }));

    try { chart.update('none'); }
    catch { chart.update(); }
  }

  async function renderMapGenomicChart(countryName, canvasId) {
    // 注意：地圖視窗和主頁 Genomic 面板是分開的。這裡不能修改 #genomic-country、
    // #genomic-gene 或 AF 滑桿，改滑桿會觸發主面板重畫成地圖的國家。
    // genomic_variation.js 看到 canvasId === 'world2' 會自己使用 Gene S，AF 範圍依序退回
    // 0.25–0.75 → 0.75–1 → 0–0.25；這裡只傳國家與 canvas。
    // Note: the map modal and the main Genomic panel are separate. Never change
    // #genomic-country, #genomic-gene or the AF slider here; moving the slider would redraw
    // the main panel with the map's country. genomic_variation.js treats canvasId === 'world2'
    // as map-only, uses Gene S and falls back on AF 0.25–0.75 → 0.75–1 → 0–0.25;
    // only the country and canvas are passed here.
    const result = await renderGeneChart(countryName, null, canvasId);

    // 地圖專用規則：在最新日期依頻率取前 10 名變異，保留其完整時間序列與每日樣本數
    // Map-only rule: keep the top 10 variations by frequency on the latest date,
    // with their full time series and the daily sample size
    enforceMapGenomicTop10(canvasId);
    return result;
  }

  /* =====================================================
     14. 開啟國家 Modal 並平行繪製四張圖
        Open the country modal and draw the four charts in parallel
  ===================================================== */
  function setChartLoading(canvasId, on) {
    const target  = document.getElementById(canvasId);
    if (!target) return;
    const wrapper = target.closest('.chart-cell') || target.parentElement;
    if (!wrapper) return;
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

    const overlayId = `loading-${canvasId}`;
    let overlay = document.getElementById(overlayId);

    if (on) {
      if (!overlay) {
        // 載入中遮罩，樣式在 tracking.css 的 .country-loading
        // Loading overlay, styled by .country-loading in tracking.css
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'country-loading';

        const spinner = document.createElement('div');
        spinner.className = 'spinner-border text-primary';
        spinner.setAttribute('role', 'status');

        const msg = document.createElement('span');
        msg.className = 'ms-2 text-primary fw-semibold';
        msg.textContent = (window.L || ((e) => e))('Loading...', '載入中...');

        overlay.appendChild(spinner);
        overlay.appendChild(msg);
        wrapper.appendChild(overlay);
      }
      overlay.style.display = 'flex';
      target.classList.add('is-loading');
    } else {
      if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
      target.classList.remove('is-loading');
    }
  }

  async function openCountryModal(countryName) {
    if (!countryName) return;

    const countryModalEl = document.getElementById('countryModal');
    if (!countryModalEl) { console.warn('#countryModal not found'); return; }

    const countryModal = new bootstrap.Modal(countryModalEl);
    const modalTitle   = document.getElementById('countryModalLabel');
    if (modalTitle) modalTitle.textContent = countryName === 'Global' ? (window.L || ((e) => e))('Global', '全球') : countryName;

    currentModalCountry = countryName;
    countryModal.show();
    bindCountryMenuOnce();

    // 載入前先清掉上一個國家的 No Data 狀態
    // Clear the previous country's No Data state before loading
    COUNTRY_CHART_IDS.forEach(id => setCountryChartNoData(id, false));

    // 銷毀舊圖
    ['world1', 'world2', 'world3', 'world4'].forEach(id => {
      try { window[id]?.destroy?.(); } catch {}
    });

    // 顯示 loading
    ['world1', 'world2', 'world3', 'world4'].forEach(id => setChartLoading(id, true));

    // 平行繪製四張圖
    await Promise.allSettled([
      (async () => {
        try { await updateChart(countryName, 'world1'); }
        catch (e) { console.error('world1', e); }
        finally   { setChartLoading('world1', false); }
      })(),
      (async () => {
        try { await renderMapGenomicChart(countryName, 'world2'); }
        catch (e) { console.error('world2', e); }
        finally   { setChartLoading('world2', false); }
      })(),
      (async () => {
        try { await drawSeries1(countryName, 'world3'); }
        catch (e) { console.error('world3', e); }
        finally   { setChartLoading('world3', false); }
      })(),
      (async () => {
        try { await drawSeries2(countryName, 'world4'); }
        catch (e) { console.error('world4', e); }
        finally   { setChartLoading('world4', false); }
      })(),
    ]);

    // 逐張判斷有沒有資料；沒資料的只顯示 No Data，不參與尺寸與時間軸計算
    // Decide chart by chart whether there is data; empty charts only show No Data
    // and are left out of sizing and shared time-axis calculations
    const dataChartIds = refreshCountryChartNoDataStates(COUNTRY_CHART_IDS);

    // 四個請求都完成後，先讓每張 canvas 填滿 .chart-cell（特別是 world4）
    // After all four requests finish, make every canvas fill its .chart-cell (especially world4)
    await new Promise(resolve => requestAnimationFrame(resolve));
    resizeCountryChartsToCells(dataChartIds);

    // 再用有資料的圖統一日期範圍
    // Then apply one shared date range using only the charts with data
    synchronizeCountryChartTimeAxes(dataChartIds);

    // 視窗動畫與 canvas 尺寸可能比資料晚完成，版面穩定後再調整一次
    // The modal animation and canvas sizing can finish after the data; resize and realign once more
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    resizeCountryChartsToCells(dataChartIds);
    synchronizeCountryChartTimeAxes(dataChartIds);

    setTimeout(() => {
      if (currentModalCountry === countryName && countryModalEl.classList.contains('show')) {
        resizeCountryChartsToCells(dataChartIds);
        synchronizeCountryChartTimeAxes(dataChartIds);
      }
    }, 300);
  }

  // 視窗完全打開後再調整一次圖表尺寸；瀏覽器縮放時也重新調整。
  // Resize the charts once the modal is fully open, and again whenever the
  // browser window changes size.
  const countryModalForResize = document.getElementById('countryModal');
  if (countryModalForResize && !countryModalForResize._countryChartResizeBound) {
    countryModalForResize.addEventListener('shown.bs.modal', () => {
      requestAnimationFrame(() => {
        const dataIds = COUNTRY_CHART_IDS.filter(id => !COUNTRY_NO_DATA_IDS.has(id));
        resizeCountryChartsToCells(dataIds);
        synchronizeCountryChartTimeAxes(dataIds);
      });
    });
    countryModalForResize._countryChartResizeBound = true;
  }

  let countryResizeTimer = null;
  window.addEventListener('resize', () => {
    if (!countryModalForResize?.classList.contains('show')) return;
    clearTimeout(countryResizeTimer);
    countryResizeTimer = setTimeout(() => {
      const dataIds = COUNTRY_CHART_IDS.filter(id => !COUNTRY_NO_DATA_IDS.has(id));
      resizeCountryChartsToCells(dataIds);
      synchronizeCountryChartTimeAxes(dataIds);
    }, 100);
  });

  window.openCountryModal = openCountryModal;

}