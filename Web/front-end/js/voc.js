/* =====================================================================
   voc.js
   Tracking 頁「Variant of Concern (VOC) Tracking（關注變異株追蹤）」面板。
   The "Variant of Concern (VOC) Tracking" panel on the Tracking page.

   畫面（2×2 卡片） / What it draws (2×2 cards)
     上排：時間趨勢 / Top row: trends over time
       - linearChart-voc ：各 VOC 的每日頻率（折線，左軸）與每日樣本數（長條，右軸）
                           Daily frequency of each VOC (lines, left axis) and the
                           daily sample size (bars, right axis)
       - linearChart-voc2：所選 VOC 的譜系（sublineage）頻率，下方圖例可點選隱藏
                           Sublineage frequencies of the selected VOCs; the legend
                           below can hide lines
     下排：組成 / Bottom row: composition
       - voc-polar    ：所選國家各 VOC 的序列總數（整體，不分日期）；
                        滑鼠移上去顯示組成的譜系
                        Total sequences per VOC for the country (overall, no
                        dates); hovering shows the sublineages
       - voc-barchart ：所選日期比例前 10 名的譜系，可用滑桿或播放鍵換日期
                        Top 10 sublineages on the selected date; the slider and
                        play button change the date

   VOC 勾選只影響 linearChart-voc2；其他三張圖一律使用全部 VOC。
   The VOC checkboxes only affect linearChart-voc2; the other charts use all VOCs.

   給其他檔案使用 / Used by other files
     - drawSeries1(country, 'world3')：地圖國家視窗的 world3（word_country.js）
     - drawSeries2(country, 'world4')：地圖國家視窗的 world4，固定 Omicron
       world3 / world4 in the map's country modal; world4 always shows Omicron

   依賴 / Depends on
     six_type.js（需先載入 / load first）：backgroundColor 白底外掛
     The backgroundColor (white background) plugin

   API
     /api/server/countries_voc.php        國家清單 / country list
     /api/server/voc_series.php           每日 VOC 頻率與樣本數 / daily VOC frequencies, sample sizes
     /api/server/voc_series2.php          每日譜系頻率 / daily sublineage frequencies
     /api/server/voc_radar.php            各 VOC 與譜系的序列總數 / sequence totals per VOC and sublineage
     /api/server/voc_histogram_top10.php  每日前 10 名譜系 / daily top 10 sublineages

   內容 / Contents
     1. 狀態與設定             State and settings
     2. Chart.js 外掛          Chart.js plugins
     3. 顏色                   Colours
     4. 下載與列印             Download and print
     5. API                    API calls
     6. VOC 勾選選單           VOC checkboxes
     7. 國家選單與載入流程     Country menu and loading
     8. VOC 頻率折線圖         VOC frequency line chart (and world3)
     9. 譜系頻率折線圖與圖例   Sublineage line chart and legend (and world4)
    10. VOC 組成圖             VOC composition chart
    11. 每日前 10 名長條圖     Daily top 10 bar chart
    12. 面板顯示時才畫下排     Draw the bottom row once the panel is visible
    13. 初始化                 Start-up
   ===================================================================== */


/* =====================================================================
   1. 狀態與設定 / State and settings
   ===================================================================== */
const VOC_API = '/api/server';

let vocchart      = null;   // VOC 頻率折線圖 / VOC frequency chart (#linearChart-voc)
let vocchart2     = null;   // 譜系頻率折線圖 / sublineage chart (#linearChart-voc2)
let vocPolarChart = null;   // VOC 組成圖 / composition chart (#voc-polar)
let vocBarChart   = null;   // 每日前 10 名 / daily top 10 (#voc-barchart)
let world3        = null;   // 地圖國家視窗 / map modal (#world3)
let world4        = null;   // 地圖國家視窗 / map modal (#world4)

let vocplayInterval = null;            // 播放計時器 / play timer

let voc1_variantList  = [];            // 資料中出現的 VOC / VOCs present in the data
let voc1_allDates     = [];            // VOC 頻率圖的日期 / dates of the VOC frequency chart
let voc_radarSummary  = {};            // { VOC: { sample, countryPct, lineages: [{ label, sample, variantPct }] } }
let voc_top10ByDate   = {};            // { date: [{ date, key, value }, ...] }
let voc_top10Country  = null;          // voc_top10ByDate 對應的國家 / country of voc_top10ByDate
let voc_lowerDates    = [];            // 每日長條圖可播放的日期 / dates for the daily bar chart
let vocInitialLoadPromise = null;      // 第一次載入，面板打開時等它完成 / first load, awaited when the panel opens

const AF_RANGE        = [0, 1];        // VOC 不篩 AF，固定全範圍 / no AF filter: full range
const WORLD4_VARIANTS = ['Omicron'];   // world4 固定顯示 / fixed for world4
const VOC_ORDER       = ['Alpha', 'Beta', 'Delta', 'Gamma', 'Omicron', 'Others'];   // 組成圖的順序 / composition order

const L_voc = (en, zh) => (window.L ? window.L(en, zh) : en);

const el = {
  canvas1:       () => document.getElementById('linearChart-voc'),
  polar:         () => document.getElementById('voc-polar'),
  bar:           () => document.getElementById('voc-barchart'),
  legend2:       () => document.getElementById('linearChart-voc2-legend'),
  selectCountry: () => document.getElementById('voc-country'),
  variantInput:  () => document.getElementById('variantInput'),
  progress:      () => document.getElementById('progressSlider-voc'),
  playBtn:       () => document.getElementById('toggleBarPlay-voc'),
  barDateLabel:  () => document.getElementById('barDateLabel-voc'),
};

function currentCountry_voc() {
  return el.selectCountry()?.value || '';
}

// 面板的圖只跟著面板自己的國家選單；地圖視窗帶別的國家進來時忽略
// Panel charts follow only the panel's country menu; ignore other countries from the map
function isVocPanelCountry(country) {
  const panel = currentCountry_voc();
  return !panel || panel === country;
}


/* =====================================================================
   2. Chart.js 外掛 / Chart.js plugins
   ===================================================================== */

// 右下角版權文字，畫在 canvas 上，下載的圖片也會有
// Credit text at the bottom right, drawn on the canvas so downloads keep it
const academiaSinicaCreditPlugin = {
  id: 'academiaSinicaCreditVOC',
  afterDraw(chart) {
    const { ctx } = chart;
    if (!ctx) return;
    const area   = chart.chartArea || {};
    const right  = Number.isFinite(area.right)  ? area.right  : (chart.width  || 0) - 8;
    const bottom = Number.isFinite(area.bottom) ? area.bottom : (chart.height || 0) - 8;
    const x = Math.min((chart.width  || right)  - 6, right);
    const y = Math.min((chart.height || bottom) - 5, bottom + 34);

    ctx.save();
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('©Academia Sinica, Taiwan', x, y);
    ctx.restore();
  },
};

// 沒有資料時，在空的座標軸中間顯示提示（options.plugins.noDataText 可自訂文字）
// Message in the middle of empty axes (custom text via options.plugins.noDataText)
const noDataPlugin_VOC = {
  id: 'noDataVOC',
  afterDraw(chart) {
    const hasPoints = (chart.data.datasets || []).some(ds => (ds.data || []).length);
    if (hasPoints) return;
    const { ctx, chartArea } = chart;
    if (!ctx || !chartArea) return;
    ctx.save();
    ctx.font = '13px Arial, sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      chart.options?.plugins?.noDataText || L_voc('No data available for this date', '此日期沒有資料'),
      (chartArea.left + chartArea.right) / 2,
      (chartArea.top + chartArea.bottom) / 2
    );
    ctx.restore();
  },
};


/* =====================================================================
   3. 顏色 / Colours
   ===================================================================== */

// 六個 VOC 固定顏色；譜系 "Omicron:BA.1" 依前面的 VOC 取色
// Fixed colours for the six VOCs; "Omicron:BA.1" takes its VOC's colour
const VARIANT_COLORS = {
  Alpha:   '#1f77b4',
  Beta:    '#ff7f0e',
  Gamma:   '#2ca02c',
  Delta:   '#d62728',
  Omicron: '#9467bd',
  Others:  '#8c564b',
};
function colorForVariantLabel(label) {
  return VARIANT_COLORS[String(label || '').split(':')[0]] || '#999';
}

// 譜系用 100 個固定顏色（黃金角度），名稱依字母排序後指派，
// 同一個譜系在折線圖與長條圖是同一個顏色
// 100 fixed colours (golden angle) for sublineages, assigned alphabetically,
// so a sublineage keeps the same colour in the line and bar charts
const VOC_PALETTE_100 = Array.from({ length: 100 }, (_, i) => `hsl(${(i * 137.508) % 360} 75% 50%)`);
const VOC_KEY_COLOR_MAP = {};

function ensureColorsFor_VOC(keys) {
  const sorted = [...new Set([...Object.keys(VOC_KEY_COLOR_MAP), ...keys])].sort();
  sorted.forEach((k, i) => {
    if (!VOC_KEY_COLOR_MAP[k]) VOC_KEY_COLOR_MAP[k] = VOC_PALETTE_100[i % VOC_PALETTE_100.length];
  });
}
function colorForKey_VOC(key) {
  if (!VOC_KEY_COLOR_MAP[key]) ensureColorsFor_VOC([key]);
  return VOC_KEY_COLOR_MAP[key];
}

function hexToRgba(hex, a = 0.4) {
  const m = String(hex).trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}


/* =====================================================================
   4. 下載與列印 / Download and print
   下載的圖片上方加一條白底標題列：國家名稱；每日長條圖再加日期。
   按鈕 id：printChart-xxx / downloadPNG-xxx / downloadJPEG-xxx / downloadPDF-xxx
   Downloads get a white header band with the country; the daily bar chart
   also shows the date. Button ids: printChart-xxx / downloadPNG-xxx / ...
   ===================================================================== */
const VOC_EXPORTS = {
  voc:      { canvasId: 'linearChart-voc',  base: 'voc_frequencies' },
  voc2:     { canvasId: 'linearChart-voc2', base: 'voc_sublineage_frequencies' },
  vocPolar: { canvasId: 'voc-polar',        base: 'voc_composition' },
  vocBar:   { canvasId: 'voc-barchart',     base: 'voc_top10_sublineages', withDate: true },
};

function currentBarDate_voc() {
  return el.barDateLabel()?.textContent?.trim() || '';
}

function exportCanvas_voc(canvasId, withDate) {
  const src = document.getElementById(canvasId);
  if (!src) return null;
  const country = currentCountry_voc();
  const date = withDate ? currentBarDate_voc() : '';
  if (!country && !date) return src;

  const scale   = src.width / (src.clientWidth || src.width) || 1;  // devicePixelRatio
  const titlePx = Math.round(20 * scale);
  const datePx  = Math.round(15 * scale);
  const pad     = Math.round(titlePx * 0.7);
  const band    = pad * 2 + titlePx + (date ? Math.round(datePx * 1.5) : 0);

  const out = document.createElement('canvas');
  out.width  = src.width;
  out.height = src.height + band;
  const ctx  = out.getContext('2d');
  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#212529';
  ctx.font = `bold ${titlePx}px ${font}`;
  ctx.fillText(country, out.width / 2, pad);
  if (date) {
    ctx.fillStyle = '#555';
    ctx.font = `${datePx}px ${font}`;
    ctx.fillText(date, out.width / 2, pad + Math.round(titlePx * 1.3));
  }
  ctx.drawImage(src, 0, band);
  return out;
}

// 檔名含國家（每日長條圖再加日期），例如 voc_top10_sublineages_Taiwan_2022-01-15.png
// File name with the country (and the date for the daily chart)
function fileName_voc(cfg, ext) {
  const safe = (t) => String(t).replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '');
  const parts = [cfg.base, safe(currentCountry_voc())];
  if (cfg.withDate) parts.push(safe(currentBarDate_voc()));
  return `${parts.filter(Boolean).join('_')}.${ext}`;
}

// 用 Blob 下載（data URL 太大時瀏覽器會擋）
// Download through a Blob (browsers block very large data URLs)
function saveCanvas_voc(canvas, mime, filename) {
  const trigger = (url, revoke) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  if (typeof canvas.toBlob === 'function') {
    canvas.toBlob(blob => {
      if (blob) trigger(URL.createObjectURL(blob), true);
      else trigger(canvas.toDataURL(mime), false);
    }, mime);
  } else {
    trigger(canvas.toDataURL(mime), false);
  }
}

function printCanvas_voc(canvas) {
  const win = window.open();
  if (win) win.document.write(`<img src="${canvas.toDataURL()}" style="max-width:100%" onload="window.print();window.close()">`);
}

function savePdf_voc(canvas, filename) {
  if (typeof jspdf === 'undefined') return;
  const pdf = new jspdf.jsPDF('landscape');
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = Math.min((pw - 20) / canvas.width, (ph - 20) / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
  pdf.save(filename);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[id^="printChart-voc"], [id^="downloadPNG-voc"], [id^="downloadJPEG-voc"], [id^="downloadPDF-voc"]');
  if (!a) return;
  const [action, key] = a.id.split('-');
  const cfg = VOC_EXPORTS[key];
  if (!cfg) return;
  e.preventDefault();

  const canvas = exportCanvas_voc(cfg.canvasId, cfg.withDate);
  if (!canvas) return;
  if (action === 'printChart')        printCanvas_voc(canvas);
  else if (action === 'downloadPNG')  saveCanvas_voc(canvas, 'image/png',  fileName_voc(cfg, 'png'));
  else if (action === 'downloadJPEG') saveCanvas_voc(canvas, 'image/jpeg', fileName_voc(cfg, 'jpg'));
  else if (action === 'downloadPDF')  savePdf_voc(canvas, fileName_voc(cfg, 'pdf'));
});


/* =====================================================================
   5. API
   ===================================================================== */
async function getJSON_voc(path, params = {}, options = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${VOC_API}/${path}${qs ? `?${qs}` : ''}`, {
    headers: { Accept: 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

const afParams = () => ({ afMin: String(AF_RANGE[0]), afMax: String(AF_RANGE[1]) });

// [{ country, totalSample }] 或 / or ["Global (1,234)", ...]
const fetchVOCCountries = () => getJSON_voc('countries_voc.php');
// 欄位 / Fields: Date, Variant, Proportion_pct, DailySample
const fetchVOCSeries = (country) => getJSON_voc('voc_series.php', { country, ...afParams() });
// 欄位 / Fields: Date, "Variant:Lineage", Proportion_pct
const fetchVOCSeries2 = (country, variants) =>
  getJSON_voc('voc_series2.php', { country, ...afParams(), variants });
// 欄位 / Fields: Variant, Lineage, VariantSample, VariantCountry_pct, LineageSample, LineageWithinVariant_pct
const fetchVOCRadar = (country) =>
  getJSON_voc('voc_radar.php', { country, raw: '1' }, { cache: 'no-store' });
// 全期每日前 10 名 / Top 10 per day for all dates
const fetchVOCHistogramTop10 = async (country, variants) =>
  normalizeTop10Payload(await getJSON_voc('voc_histogram_top10.php',
    { country, ...afParams(), variants: variants.join(',') }, { cache: 'no-store' }));

// 後端回傳格式不只一種，統一成 [{ date, key, value }]（value 為 0–100）
// The backend returns several shapes; normalise to [{ date, key, value }] (value 0–100)
function numberAsPct(x) {
  const n = typeof x === 'string' ? parseFloat(x) : +x;
  return isFinite(n) ? (n <= 1 ? n * 100 : n) : 0;
}
function rowToTop10Entry(r) {
  if (!r) return null;
  const date    = r.Date ?? r.date ?? r.dt ?? r.day;
  const variant = r.Variant ?? r.variant ?? '';
  const lineage = r.Lineage ?? r.lineage ?? '';
  const key     = r['Variant:Lineage'] ?? (variant ? `${variant}:${lineage}` : r.name ?? r.id);
  const raw     = r.Proportion_pct ?? r.percentage ?? r.Percentage ?? r.Proportion ?? r.proportion ?? r.value;
  if (!date || !key || raw == null) return null;
  return { date: String(date), key: String(key), value: numberAsPct(raw) };
}
function normalizeTop10Payload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload))         return payload.map(rowToTop10Entry).filter(Boolean);
  if (Array.isArray(payload.entries)) return payload.entries.map(rowToTop10Entry).filter(Boolean);
  if (payload.entries && typeof payload.entries === 'object') {
    const d = payload.date ? String(payload.date) : '';
    return Object.entries(payload.entries).map(([k, v]) => ({ date: d, key: String(k), value: numberAsPct(v) }));
  }
  if (Array.isArray(payload.rows)) return payload.rows.map(rowToTop10Entry).filter(Boolean);
  if (Array.isArray(payload.data)) return payload.data.map(rowToTop10Entry).filter(Boolean);
  return [];
}

const rowsOf = (data) => (Array.isArray(data) ? data : (data?.rows || data?.data || []));

// Proportion_pct（0–100）優先；否則 Proportion（0–1 或 0–100）
// Prefer Proportion_pct (0–100); otherwise Proportion (0–1 or 0–100)
function rowPct(r) {
  if (r.Proportion_pct != null) return Number(r.Proportion_pct);
  const p = r.proportion ?? r.Proportion;
  return p != null ? (p > 1 ? +p : +p * 100) : null;
}


/* =====================================================================
   6. VOC 勾選選單 / VOC checkboxes
   預設只勾 Omicron；勾選改變時只重畫譜系頻率圖。
   Omicron is checked by default; a change only redraws the sublineage chart.
   ===================================================================== */
function getSelectedVariants() {
  return [...document.querySelectorAll('.variant-checkbox')]
    .filter(cb => cb.checked && cb.id !== 'v-All')
    .map(cb => cb.value);
}

// 資料中出現的所有 VOC（每日前 10 名用，不受勾選影響）
// All VOCs present in the data (used by the daily top 10, ignores the checkboxes)
function getAllVariants() {
  if (voc1_variantList.length) return voc1_variantList;
  return [...document.querySelectorAll('.variant-checkbox')]
    .filter(cb => cb.id !== 'v-All')
    .map(cb => cb.value);
}

function initVariantCheckbox() {
  const allBox      = document.getElementById('v-All');
  const input       = el.variantInput();
  const optionBoxes = [...document.querySelectorAll('.variant-checkbox')].filter(cb => cb.id !== 'v-All');
  if (!allBox || !input) return;

  // 輸入框顯示已勾選的 VOC；沒勾選時顯示提示文字（跟著語言切換）
  // The box lists the checked VOCs; with none checked it shows a hint (follows the language)
  const showSelection = () => {
    input.value = optionBoxes.filter(b => b.checked).map(b => b.value).join(', ');
    input.placeholder = L_voc('Select VOCs', '選擇變異株');
  };

  optionBoxes.forEach(cb => (cb.checked = cb.value === 'Omicron'));
  allBox.checked = false;
  showSelection();
  window.addEventListener('sitelangchange', showSelection);

  document.querySelectorAll('.variant-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb === allBox) {
        optionBoxes.forEach(box => (box.checked = cb.checked));
      } else {
        allBox.checked = optionBoxes.every(b => b.checked);
      }
      showSelection();
      const country = currentCountry_voc();
      if (country) drawSeries2(country);
    });
  });
}


/* =====================================================================
   7. 國家選單與載入流程 / Country menu and loading
   ===================================================================== */

// Global 放最上面，其他國家放在「Countries」群組
// Global goes first; the other countries go in a "Countries" group
async function loadCountries() {
  const sel = el.selectCountry();
  sel.innerHTML = '';

  const rows = rowsOf(await fetchVOCCountries());
  const nameOf = r => r.country ?? r.Country ?? (typeof r === 'string' ? r.replace(/\s*\(\d[\d,]*\)\s*$/, '') : '');
  rows.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const makeOption = r => {
    const c   = nameOf(r);
    const n   = r.totalSample ?? r.TotalSample ?? 0;
    const opt = document.createElement('option');
    opt.value = c;
    opt.text  = typeof r === 'string' ? r : `${c} (${(+n).toLocaleString()})`;
    return opt;
  };

  const globalRows  = rows.filter(r => nameOf(r) === 'Global');
  const countryRows = rows.filter(r => nameOf(r) !== 'Global');

  globalRows.forEach(r => {
    const opt = makeOption(r);
    opt.style.fontWeight = '700';
    sel.appendChild(opt);
  });

  if (countryRows.length) {
    const group = document.createElement('optgroup');
    group.label = globalRows.length
      ? `──────────  ${L_voc('Countries', '國家')}  ──────────`
      : L_voc('Countries', '國家');
    countryRows.forEach(r => group.appendChild(makeOption(r)));
    sel.appendChild(group);
  }

  sel.value = globalRows.length ? 'Global' : sel.options[0]?.value;

  // 換國家：先畫 VOC 頻率圖，再載入下排兩張圖的資料並畫出，最後才畫較慢的譜系圖
  // New country: VOC frequency chart first, then the bottom row, and the slower
  // sublineage chart last
  sel.addEventListener('change', async () => {
    const country = sel.value;
    await loadPanelData(country);
    drawRadarSummary();
    if (voc_lowerDates[0]) await drawTop10Bar(country, voc_lowerDates[0]);
    drawSeries2(country).catch(err => console.error('VOC sublineage chart failed:', err));
  });

  return sel.value;
}

// VOC 頻率圖 + 下排兩張圖的資料 / VOC frequency chart + data for the bottom row
async function loadPanelData(country) {
  stopVocPlay();
  await drawSeries1(country);
  await Promise.all([loadRadarSummary(country), loadTop10Map(country)]);
  setupBarControls(country);
}


/* =====================================================================
   8. VOC 頻率折線圖（含 world3） / VOC frequency line chart (and world3)
   ===================================================================== */

// Y 軸上限：最大值多留約 8%，再取到好讀的刻度
// Y-axis maximum: about 8% above the largest value, rounded to a readable step
function getAdaptiveFrequencyAxisMax(byVariant) {
  let maxValue = 0;
  Object.values(byVariant || {}).forEach(dateMap => {
    Object.values(dateMap || {}).forEach(value => {
      const n = Number(value);
      if (Number.isFinite(n)) maxValue = Math.max(maxValue, n);
    });
  });
  if (maxValue <= 0) return 1;

  const padded = Math.min(100, maxValue * 1.08);
  const step =
    padded <= 1  ? 0.1 :
    padded <= 5  ? 0.5 :
    padded <= 10 ? 1   :
    padded <= 25 ? 2.5 :
    padded <= 50 ? 5   : 10;
  return Math.min(100, Math.max(step, Math.ceil(padded / step) * step));
}

async function drawSeries1(country, canvasId = 'linearChart-voc') {
  const isMain = canvasId === 'linearChart-voc';
  if (isMain && !isVocPanelCountry(country)) return;
  const raw = await fetchVOCSeries(country);

  const dateSet = new Set();
  const sampleByDate = {};
  const byVariant = {};

  for (const r of rowsOf(raw)) {
    const date    = r.date ?? r.Date;
    const variant = r.variant ?? r.Variant;
    dateSet.add(date);
    if (!(date in sampleByDate)) sampleByDate[date] = +(r.dailySample ?? r.DailySample ?? r.Sample ?? 0) || 0;
    (byVariant[variant] ??= {})[date] = Number(rowPct(r)) || 0;
  }

  // 只保留第一個到最後一個有 VOC 比例的日期（只有樣本數的日期不算）
  // Keep only the first to the last date with a VOC proportion (sample-only dates do not count)
  const datesAll = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
  const hasData  = d => Object.values(byVariant).some(m => (m[d] ?? 0) > 0);
  const firstIdx = datesAll.findIndex(hasData);
  const lastIdx  = datesAll.length - 1 - [...datesAll].reverse().findIndex(hasData);
  const labels   = firstIdx >= 0 ? datesAll.slice(firstIdx, lastIdx + 1) : datesAll;

  if (isMain) {
    voc1_variantList = Object.keys(byVariant);
    voc1_allDates    = labels;
  }

  const yMax = getAdaptiveFrequencyAxisMax(byVariant);

  // 'Sample Size' 這個名稱 word_country.js 會用來判斷資料種類，畫面上由
  // chart-i18n.js 顯示為「Daily sample size／每日樣本數」
  // word_country.js relies on the name 'Sample Size'; chart-i18n.js displays it
  // as "Daily sample size"
  const datasets = [
    {
      type: 'bar',
      label: 'Sample Size',
      data: labels.map(d => sampleByDate[d] ?? 0),
      backgroundColor: '#d5d8dc',
      yAxisID: 'y1',
      order: 2,
    },
    ...Object.keys(byVariant).map(v => ({
      type: 'line',
      label: v,
      data: labels.map(d => byVariant[v][d] ?? null),
      yAxisID: 'y',
      spanGaps: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
      borderColor: colorForVariantLabel(v),
      backgroundColor: colorForVariantLabel(v),
      order: 1,
    })),
  ];

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (isMain) vocchart?.destroy();
  else        world3?.destroy();

  const chart = new Chart(canvas, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', tooltipFormat: 'yyyy-MM-dd', displayFormats: { month: "MMM ''yy" } },
          title: { display: true, text: 'Date' },
          ticks: { maxTicksLimit: 8, maxRotation: 0 },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'VOC frequency (%)' },
          min: 0,
          max: yMax,
          ticks: {
            maxTicksLimit: 7,
            callback: value => {
              const n = Number(value);
              if (!Number.isFinite(n)) return value;
              return yMax <= 5 ? n.toFixed(n % 1 ? 1 : 0) : n.toLocaleString();
            },
          },
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Number of daily samples' },
          grid: { drawOnChartArea: false },
          ticks: { callback: v => v.toLocaleString() },
        },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, padding: 8 } },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const ds = ctx.dataset;
              if (ds?.yAxisID === 'y1') {
                return `${L_voc('Daily sample size', '每日樣本數')}: ${Math.round(ctx.parsed?.y ?? 0).toLocaleString()}`;
              }
              const y = ctx.parsed?.y;
              return typeof y === 'number' ? `${ds?.label ?? ''}: ${y.toFixed(2)}%` : ctx.formattedValue;
            },
          },
        },
      },
    },
    plugins: [academiaSinicaCreditPlugin, backgroundColor],
  });

  if (isMain) vocchart = chart;
  else        world3 = chart;
}


/* =====================================================================
   9. 譜系頻率折線圖與圖例（含 world4）
      Sublineage line chart and legend (and world4)
   面板：依勾選的 VOC；world4：固定 Omicron，且不改動面板的狀態。
   Panel: the checked VOCs; world4: always Omicron, without touching the panel.
   ===================================================================== */
async function drawSeries2(country, canvasId = 'linearChart-voc2') {
  const isMain = canvasId === 'linearChart-voc2';
  if (isMain && !isVocPanelCountry(country)) return;
  const variants = isMain ? getSelectedVariants() : WORLD4_VARIANTS;

  // 沒勾任何 VOC 就不查（後端在 variants 為空時會改用 Omicron）
  // Nothing checked: skip the request (the backend would fall back to Omicron)
  const rows = variants.length ? rowsOf(await fetchVOCSeries2(country, variants.join(','))) : [];

  const dateSet = new Set();
  const seriesMap = {};   // 'VOC:Sublineage' → { date → % }
  for (const r of rows) {
    const date = r.Date ?? r.date;
    const key  = r['Variant:Lineage'] ?? (r.Variant ? `${r.Variant}:${r.Lineage ?? ''}` : null);
    const pct  = rowPct(r);
    if (!date || !key || pct == null) continue;
    dateSet.add(date);
    (seriesMap[key] ??= {})[date] = +pct;
  }

  // 從第一個有數值的日期開始 / Start from the first date with a value
  const datesAll = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
  const firstIdx = datesAll.findIndex(d => Object.values(seriesMap).some(m => (m[d] ?? 0) > 0));
  const dates    = firstIdx > 0 ? datesAll.slice(firstIdx) : datesAll;

  const keys = Object.keys(seriesMap);
  ensureColorsFor_VOC(keys);
  const datasets = keys.map(k => ({
    type: 'line',
    label: k,
    data: dates.map(d => seriesMap[k][d] ?? null),
    yAxisID: 'yLeft',
    spanGaps: true,
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    borderColor: colorForKey_VOC(k),
    backgroundColor: colorForKey_VOC(k),
  }));

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (isMain) vocchart2?.destroy();
  else        world4?.destroy();

  const chart = new Chart(canvas, {
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', tooltipFormat: 'yyyy-MM-dd', displayFormats: { month: "MMM ''yy" } },
          title: { display: true, text: 'Date' },
          ticks: { maxTicksLimit: 8, maxRotation: 0 },
        },
        yLeft: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Sublineage frequency (%)' },
          min: 0,
        },
      },
      plugins: {
        // 圖上方標題：目前勾選的 VOC / Title above the chart: the checked VOCs
        title: { display: true, text: variants.length ? variants.join(' / ') : 'VOC:Sublineage', font: { size: 13 } },
        noDataText: 'Select at least one VOC to view sublineage frequencies',
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          // 只列出有數值的譜系，由大到小 / Only sublineages with a value, largest first
          itemSort: (a, b) => (b.parsed?.y ?? 0) - (a.parsed?.y ?? 0),
          filter: item => (item.parsed?.y ?? 0) > 0,
          callbacks: {
            label(ctx) {
              const y = ctx.parsed?.y;
              return typeof y === 'number' ? `${ctx.dataset?.label ?? ''}: ${y.toFixed(2)}%` : ctx.formattedValue;
            },
          },
        },
      },
    },
    plugins: [academiaSinicaCreditPlugin, backgroundColor, noDataPlugin_VOC],
  });

  if (isMain) {
    vocchart2 = chart;
    renderCustomLegend_voc(chart);
  } else {
    world4 = chart;
  }
}

// 譜系圖下方的圖例，點一下隱藏或顯示該條線；樣式在 tracking.css 的 .voc-legend-*
// Legend under the sublineage chart; click to hide or show a line. Styles: .voc-legend-* in tracking.css
function renderCustomLegend_voc(chart) {
  const container = el.legend2();
  if (!container) return;
  container.innerHTML = '';

  chart.data.datasets.forEach(ds => {
    const item = document.createElement('div');
    item.className = 'voc-legend-item' + (ds.hidden ? ' is-hidden' : '');
    item.title = ds.label;

    const swatch = document.createElement('span');
    swatch.className = 'voc-legend-swatch';
    swatch.style.backgroundColor = ds.borderColor;

    const label = document.createElement('span');
    label.className = 'voc-legend-label';
    label.textContent = ds.label;

    item.append(swatch, label);
    item.addEventListener('click', () => {
      ds.hidden = !ds.hidden;
      item.classList.toggle('is-hidden', ds.hidden);
      chart.update();
    });
    container.appendChild(item);
  });
}


/* =====================================================================
   10. VOC 組成圖 / VOC composition chart
   各 VOC 的序列總數（整體，不分日期）；只畫這個國家有資料的 VOC。
   滑鼠移上去顯示前 10 個譜系，其餘合併成一行。
   Total sequences per VOC (overall, no dates); only VOCs with data are drawn.
   Hovering lists the top 10 sublineages and sums up the rest in one line.
   ===================================================================== */
async function loadRadarSummary(country) {
  voc_radarSummary = {};
  try {
    for (const r of rowsOf(await fetchVOCRadar(country))) {
      const variant = r.Variant ?? r.variant;
      if (!variant) continue;
      const entry = (voc_radarSummary[variant] ??= { sample: 0, countryPct: 0, lineages: [] });
      entry.sample     = Number(r.VariantSample ?? r.variantSample ?? 0) || 0;
      entry.countryPct = Number(r.VariantCountry_pct ?? r.variantCountryPct ?? 0) || 0;

      const lineage = r.Lineage ?? r.lineage ?? '';
      if (lineage) {
        entry.lineages.push({
          label:      lineage,
          sample:     Number(r.LineageSample ?? r.lineageSample ?? 0) || 0,
          variantPct: Number(r.LineageWithinVariant_pct ?? r.lineageWithinVariantPct ?? 0) || 0,
        });
      }
    }
    Object.values(voc_radarSummary).forEach(e => e.lineages.sort((a, b) => b.sample - a.sample));
  } catch (err) {
    console.error('VOC composition data failed:', err);
  }
}

// 1234 → 1.2K / 1234567 → 1.2M
function compactCount(n) {
  const x = Number(n) || 0;
  if (Math.abs(x) >= 1e9) return `${(x / 1e9).toFixed(1)}B`;
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (Math.abs(x) >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return Math.round(x).toLocaleString();
}

function drawRadarSummary() {
  const canvas = el.polar();
  if (!canvas) return;

  const labels = VOC_ORDER.filter(v => (Number(voc_radarSummary[v]?.sample) || 0) > 0);
  const values = labels.map(v => Math.round(Number(voc_radarSummary[v].sample) || 0));
  const colors = labels.map(colorForVariantLabel);

  if (vocPolarChart) {
    const ds = vocPolarChart.data.datasets[0];
    vocPolarChart.data.labels = labels;
    ds.data            = values;
    ds.backgroundColor = colors.map(c => hexToRgba(c, 0.45));
    ds.borderColor     = colors;
    vocPolarChart.update('none');
    return;
  }

  vocPolarChart = new Chart(canvas, {
    type: 'polarArea',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => hexToRgba(c, 0.45)),
        borderColor: colors,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 4, bottom: 16, left: 4, right: 4 } },
      scales: { r: { beginAtZero: true, ticks: { callback: v => compactCount(v) } } },
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const entry = voc_radarSummary[ctx.label] || {};
              const n   = Math.round(Number(entry.sample ?? ctx.raw ?? 0) || 0).toLocaleString();
              const pct = (Number(entry.countryPct) || 0).toFixed(2);
              return L_voc(
                `Total: ${n} sequences (${pct}% of all VOC samples)`,
                `總計：${n} 條序列（占所有變異株樣本的 ${pct}%）`);
            },
            afterLabel: ctx => {
              const voc  = ctx.label;
              const rows = voc_radarSummary[voc]?.lineages || [];
              if (!rows.length) return '';

              const shown = rows.slice(0, 10);
              const lines = [
                L_voc(`Sublineages within ${voc}:`, `${voc} 包含的譜系：`),
                ...shown.map(r => {
                  const n = Math.round(r.sample).toLocaleString();
                  const p = r.variantPct.toFixed(2);
                  return L_voc(`  ${r.label}: ${n} sequences (${p}% of ${voc})`,
                               `  ${r.label}：${n} 條序列（占 ${voc} 的 ${p}%）`);
                }),
              ];

              const rest = rows.slice(shown.length);
              if (rest.length) {
                const restSample = rest.reduce((sum, r) => sum + (Number(r.sample) || 0), 0);
                const total = Number(voc_radarSummary[voc]?.sample) || 0;
                const n = Math.round(restSample).toLocaleString();
                const p = (total > 0 ? restSample / total * 100 : 0).toFixed(2);
                lines.push(L_voc(`  Other ${rest.length} sublineages: ${n} sequences (${p}% of ${voc})`,
                                 `  其他 ${rest.length} 個譜系：${n} 條序列（占 ${voc} 的 ${p}%）`));
              }
              return lines;
            },
          },
        },
      },
    },
    plugins: [academiaSinicaCreditPlugin, backgroundColor, noDataPlugin_VOC],
  });
}


/* =====================================================================
   11. 每日前 10 名長條圖 / Daily top 10 bar chart
   一個國家只抓一次全期資料，播放時不再逐日呼叫 API。
   All dates are fetched once per country; playing does not call the API.
   ===================================================================== */
async function loadTop10Map(country) {
  voc_top10ByDate  = {};
  voc_top10Country = country;
  try {
    for (const e of await fetchVOCHistogramTop10(country, getAllVariants())) {
      if (e.date) (voc_top10ByDate[e.date] ??= []).push(e);
    }
    Object.values(voc_top10ByDate).forEach(list => list.sort((a, b) => b.value - a.value));
  } catch (err) {
    console.error('VOC top 10 data failed:', err);
    voc_top10Country = null;
  }

  // 可播放的日期：前 10 名資料的日期；沒有時改用 VOC 頻率圖的日期
  // Playable dates: those in the top 10 data, or the VOC frequency dates if there are none
  const byDate = (a, b) => new Date(a) - new Date(b);
  const top10Dates = Object.keys(voc_top10ByDate).sort(byDate);
  voc_lowerDates = top10Dates.length ? top10Dates : [...voc1_allDates].sort(byDate);
}

async function drawTop10Bar(country, date) {
  if (!date) return;
  el.barDateLabel().textContent = date;
  if (voc_top10Country !== country) await loadTop10Map(country);

  const entries = (voc_top10ByDate[date] || []).slice(0, 10);
  const hasData = entries.length > 0;
  const labels  = entries.map(e => e.key);
  const values  = entries.map(e => +(+e.value).toFixed(2));
  ensureColorsFor_VOC(labels);

  vocBarChart?.destroy();
  vocBarChart = new Chart(el.bar(), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: labels.map(colorForKey_VOC) }] },
    options: {
      animation: false,
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ...(hasData ? {} : { max: 100 }),   // 沒資料時仍畫出完整座標軸 / full axis even without data
          title: { display: true, text: 'Proportion (%)' },
          ticks: { callback: v => `${v}%` },
        },
        y: { ticks: { font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          enabled: hasData,
          callbacks: { label: ctx => `${ctx.label} — ${L_voc('Proportion', '比例')}: ${Number(ctx.parsed.x || 0).toFixed(2)}%` },
        },
      },
    },
    plugins: [academiaSinicaCreditPlugin, backgroundColor, noDataPlugin_VOC],
  });
}

function stopVocPlay() {
  if (vocplayInterval) clearInterval(vocplayInterval);
  vocplayInterval = null;
  const btn = el.playBtn();
  if (btn) btn.textContent = '▶';
}

// 滑桿與播放鍵：每 300 毫秒前進一天，到最後一天停止；在最後一天按播放會從頭開始
// Slider and play button: one day every 300 ms, stopping at the last day;
// pressing play on the last day starts again from day 1
function setupBarControls(country) {
  const slider = el.progress();
  const btn    = el.playBtn();
  const dates  = voc_lowerDates;
  stopVocPlay();

  if (!slider) return;
  slider.min = 0;
  slider.max = Math.max(0, dates.length - 1);
  slider.value = 0;
  slider.oninput = async () => {
    const date = dates[Number(slider.value)];
    if (date) await drawTop10Bar(country, date);
  };

  if (!btn) return;
  btn.onclick = !dates.length ? null : async () => {
    if (vocplayInterval) { stopVocPlay(); return; }

    if (+slider.value >= +slider.max) {
      slider.value = 0;
      await slider.oninput();
    }

    btn.textContent = '⏸';
    let busy = false;
    vocplayInterval = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        if (+slider.value >= +slider.max) { stopVocPlay(); return; }
        slider.value = +slider.value + 1;
        await slider.oninput();
        if (+slider.value >= +slider.max) stopVocPlay();
      } finally {
        busy = false;
      }
    }, 300);
  };
}


/* =====================================================================
   12. 面板顯示時才畫下排 / Draw the bottom row once the panel is visible
   面板一開始是隱藏的；在隱藏時建立組成圖與長條圖，canvas 尺寸會是 0。
   所以先載入資料，等面板打開（shown.bs.offcanvas）後再畫。
   The panel starts hidden, and charts created while hidden get a 0×0 canvas.
   Data is loaded first; the bottom row is drawn after the panel opens.
   ===================================================================== */
async function renderLowerChartsWhenVisible() {
  const panel = document.getElementById('voc');
  if (!panel?.classList.contains('show')) return;

  // 等 Bootstrap 排版完成，canvas 才有實際寬高
  // Wait for Bootstrap's layout so the canvases have a real size
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  vocPolarChart?.destroy();
  vocPolarChart = null;
  vocBarChart?.destroy();
  vocBarChart = null;

  const dates = voc_lowerDates;
  const slider = el.progress();
  let i = Number(slider?.value ?? 0);
  if (!Number.isFinite(i) || i < 0 || i >= dates.length) i = 0;
  if (slider) slider.value = i;

  drawRadarSummary();
  if (dates[i]) await drawTop10Bar(currentCountry_voc() || 'Global', dates[i]);

  vocchart?.resize();
  vocchart2?.resize();
}


/* =====================================================================
   13. 初始化 / Start-up
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('resize', () => {
    vocchart?.resize();
    vocchart2?.resize();
    vocPolarChart?.resize();
    vocBarChart?.resize();
  });

  initVariantCheckbox();

  document.getElementById('voc')?.addEventListener('shown.bs.offcanvas', async () => {
    try {
      await vocInitialLoadPromise;
      await renderLowerChartsWhenVisible();
    } catch (err) {
      console.error('VOC bottom-row charts failed:', err);
    }
  });

  try {
    vocInitialLoadPromise = (async () => {
      const country = await loadCountries();
      await loadPanelData(country);
      return country;
    })();
    const country = await vocInitialLoadPromise;

    // 面板已經打開（例如網址帶 #voc）就馬上畫下排
    // If the panel is already open (e.g. the URL has #voc), draw the bottom row now
    await renderLowerChartsWhenVisible();

    // 譜系圖較慢，最後才畫 / The sublineage chart is slower, so it is drawn last
    drawSeries2(country).catch(err => console.error('VOC sublineage chart failed:', err));
  } catch (err) {
    console.error('Failed to start the VOC panel:', err);
  }
});