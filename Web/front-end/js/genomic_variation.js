/* =====================================================================
   genomic_variation.js
   Tracking 頁「Emerging Genomic Variation（新興基因體變異）」面板。
   The "Emerging Genomic Variation" panel on the Tracking page.

   畫面 / What it draws
     - linearChart-geno：各變異的每日頻率（折線，左軸）與每日樣本數（長條，右軸），
       下方是可點選隱藏線條的圖例
       Daily frequency of each variation (lines, left axis) and the daily sample
       size (bars, right axis), with a clickable legend below
     - barChart-gene：所選日期頻率最高的 15 個變異（橫向長條），可用滑桿或播放鍵換日期
       Top 15 variations on the selected date (horizontal bars); the slider and
       play button change the date
     - Latest AF 滑桿：只顯示最新等位基因頻率落在範圍內的變異
       Latest AF slider: only variations whose latest allele frequency is in range

   AF 範圍自動退回 / AF fallback
     先查 0.25–0.75；沒有資料就改查 0.75–1，再查 0–0.25，滑桿會跟著移到實際使用的範圍。
     0.25–0.75 is tried first; with no data, 0.75–1 and then 0–0.25 are tried,
     and the slider moves to the range actually used.

   給其他檔案使用 / Used by other files
     - renderGeneChart(country, null, 'world2')：地圖國家視窗的 world2（word_country.js）。
       world2 固定使用 Gene S，與面板的選單、滑桿完全獨立。
       Draws world2 in the map's country modal (word_country.js). world2 always
       uses Gene S and is independent of the panel menus and slider.

   依賴 / Depends on
     six_type.js（需先載入 / load first）：全域註冊的版權文字與白底外掛、destroyIfExists()
     Globally registered credit and white-background plugins, destroyIfExists()

   API
     /api/server/countries_genomic.php              國家清單 / country list
     /api/server/genomic_genes.php?country=         基因清單 / gene list
     /api/server/genomic_series.php?...             每日頻率 / daily frequencies
     /api/server/genomic_histogram_top15.php?...    每日前 15 名 / daily top 15

   內容 / Contents
     1. 狀態                   State
     2. 顏色                   Colours
     3. 下載與列印             Download and print
     4. API                    API calls
     5. AF 範圍自動退回        AF fallback
     6. 國家、基因選單         Country and gene menus
     7. 折線圖（含 world2）    Line chart (and world2)
     8. 圖例                   Legend
     9. 每日前 15 名長條圖     Daily top 15 bar chart
    10. 面板載入流程           Panel loading
    11. Latest AF 滑桿         Latest AF slider
    12. 初始化                 Start-up
   ===================================================================== */


/* =====================================================================
   1. 狀態 / State
   ===================================================================== */
const GENE_API = '/api/server';

let genechart    = null;    // 面板折線圖 / panel line chart (#linearChart-geno)
let world2       = null;    // 地圖國家視窗的小圖 / small chart in the map modal (#world2)
let genebarChart = null;    // 每日前 15 名長條圖 / daily top 15 bar chart (#barChart-gene)

// 每日長條圖的播放狀態 / Play state of the daily bar chart
let genebarDates      = [];   // 可播放的日期 / dates that can be played
let genebarDataByDate = {};   // { date: [{ label, value, color }] }
let genebarIndex      = 0;    // 目前顯示第幾天 / index of the date shown
let genebarTimer      = null;

// 目前面板顯示的國家（下載圖片時寫在標題列）
// Country shown in the panel (written in the header band of downloads)
let geneCurrentCountry = '';

// world2 固定設定 / Fixed settings for world2
const WORLD2_GENE = 'S';
const WORLD2_AF   = [0.25, 0.75];

const L_gene = (en, zh) => (window.L ? window.L(en, zh) : en);


/* =====================================================================
   2. 顏色 / Colours
   100 個固定顏色（黃金角度分配色相）；變異名稱依字母排序後指派，
   同一個變異在折線圖、圖例與長條圖都是同一個顏色。
   100 fixed colours (hues spaced by the golden angle), assigned to variation
   names in alphabetical order, so a variation keeps the same colour in the
   line chart, legend and bar chart.
   ===================================================================== */
const PALETTE_100 = (() => {
  const out = [];
  const golden = 137.50776405;
  const sats   = [88, 78];
  const lights = [54, 64, 44];
  for (let i = 0; i < 100; i++) {
    const h = (i * golden) % 360;
    const s = sats[i % sats.length];
    const l = lights[Math.floor(i / sats.length) % lights.length];
    out.push(`hsl(${h.toFixed(2)}, ${s}%, ${l}%)`);
  }
  return out;
})();

let GP_COLOR_MAP = {};   // { 'Gene:Protein': color }

function ensureColorsFor(keys) {
  const sorted = [...new Set([...Object.keys(GP_COLOR_MAP), ...keys])].sort();
  sorted.forEach((k, i) => {
    if (!GP_COLOR_MAP[k]) GP_COLOR_MAP[k] = PALETTE_100[i % PALETTE_100.length];
  });
}

function colorForGP(key) {
  if (!GP_COLOR_MAP[key]) ensureColorsFor([key]);
  return GP_COLOR_MAP[key];
}


/* =====================================================================
   3. 下載與列印 / Download and print
   下載的圖片上方加一條白底標題列：國家名稱；每日長條圖再加日期。
   Downloads get a white header band with the country; the daily bar chart
   also shows the date.
   ===================================================================== */
function currentCountry_gene() {
  return geneCurrentCountry || document.getElementById('genomic-country')?.value || '';
}

function currentBarDate_gene() {
  return document.getElementById('barDateLabel-gene')?.textContent.trim() || '';
}

function exportCanvas_gene(canvasId) {
  const src = document.getElementById(canvasId);
  if (!src) return null;
  const country = currentCountry_gene();
  const date = canvasId === 'barChart-gene' ? currentBarDate_gene() : '';
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

// 檔名含國家（每日長條圖再加日期），例如 variation_daily_Taiwan_2021-05-01.png
// File name with the country (and the date for the daily chart)
function fileName_gene(base, ext) {
  const safe = (t) => String(t).replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '');
  const parts = [base, safe(currentCountry_gene())];
  if (base === 'variation_daily') parts.push(safe(currentBarDate_gene()));
  return `${parts.filter(Boolean).join('_')}.${ext}`;
}

// 用 Blob 下載（data URL 太大時瀏覽器會擋）
// Download through a Blob (browsers block very large data URLs)
function downloadCanvas_gene(mime, filename, canvasId) {
  const canvas = exportCanvas_gene(canvasId);
  if (!canvas) return;
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

function downloadPdf_gene(canvasId, filename) {
  const canvas = exportCanvas_gene(canvasId);
  if (!canvas || typeof jspdf === 'undefined') return;
  const pdf = new jspdf.jsPDF('landscape');
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = Math.min((pw - 20) / canvas.width, (ph - 20) / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
  pdf.save(filename);
}

function printCanvas_gene(canvasId) {
  const canvas = exportCanvas_gene(canvasId);
  if (!canvas) return;
  const win = window.open();
  if (win) win.document.write(`<img src="${canvas.toDataURL()}" style="max-width:100%" onload="window.print();window.close()">`);
}

// 下載選單：-gene 是折線圖，-geneBar 是每日長條圖
// Download menus: -gene is the line chart, -geneBar the daily bar chart
document.addEventListener('click', (e) => {
  const el = e.target.closest(
    '#printChart-gene, #downloadPNG-gene, #downloadJPEG-gene, #downloadPDF-gene,' +
    '#printChart-geneBar, #downloadPNG-geneBar, #downloadJPEG-geneBar, #downloadPDF-geneBar'
  );
  if (!el) return;
  e.preventDefault();

  const isBar    = el.id.endsWith('geneBar');
  const canvasId = isBar ? 'barChart-gene' : 'linearChart-geno';
  const name     = isBar ? 'variation_daily' : 'variation_chart';

  if (el.id.startsWith('printChart'))        printCanvas_gene(canvasId);
  else if (el.id.startsWith('downloadPNG'))  downloadCanvas_gene('image/png',  fileName_gene(name, 'png'), canvasId);
  else if (el.id.startsWith('downloadJPEG')) downloadCanvas_gene('image/jpeg', fileName_gene(name, 'jpg'), canvasId);
  else if (el.id.startsWith('downloadPDF'))  downloadPdf_gene(canvasId, fileName_gene(name, 'pdf'));
});


/* =====================================================================
   4. API
   ===================================================================== */
async function getJSON_gene(path) {
  const res = await fetch(`${GENE_API}/${path}`);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

const afQuery = ({ country, gene, afMin, afMax }) =>
  `country=${encodeURIComponent(country)}&gene=${encodeURIComponent(gene)}&afMin=${afMin}&afMax=${afMax}`;

// ["Global (1,234)", "Taiwan (567)", ...]
const fetchGenomicCountries = () => getJSON_gene('countries_genomic.php');
// ["All", "S", "N", ...]
const fetchGenes = (country) => getJSON_gene(`genomic_genes.php?country=${encodeURIComponent(country)}`);
// 欄位 / Fields: Date, Variation, "Gene:Protein", Proportion_pct, Sample
const fetchSeries = (q) => getJSON_gene(`genomic_series.php?${afQuery(q)}`);
// 欄位 / Fields: Date, Variation, "Gene:Protein", Proportion_pct
const fetchHistogramTop15 = (q) => getJSON_gene(`genomic_histogram_top15.php?${afQuery(q)}`);


/* =====================================================================
   5. AF 範圍自動退回 / AF fallback
   先查呼叫端指定的範圍，再依序查 0.25–0.75 → 0.75–1 → 0–0.25，
   第一個有資料的範圍就採用。
   The requested range is tried first, then 0.25–0.75 → 0.75–1 → 0–0.25;
   the first range with data is used.
   ===================================================================== */
const GENOMIC_AF_FALLBACKS = [[0.25, 0.75], [0.75, 1], [0, 0.25]];

function sameAfRange(aMin, aMax, bMin, bMax) {
  return Math.abs(Number(aMin) - Number(bMin)) < 1e-9 &&
         Math.abs(Number(aMax) - Number(bMax)) < 1e-9;
}

function buildGenomicAfCandidates(afMin, afMax) {
  const out = [];
  [[afMin, afMax], ...GENOMIC_AF_FALLBACKS].forEach(([lo, hi]) => {
    lo = Number(lo); hi = Number(hi);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    if (out.some(([a, b]) => sameAfRange(a, b, lo, hi))) return;
    out.push([lo, hi]);
  });
  return out;
}

// 至少一筆有日期、變異名稱與數字頻率 / At least one row with a date, name and numeric frequency
function genomicRowsHaveMutationData(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some(r => {
    const date = String(r?.Date ?? r?.date ?? '').trim();
    const gp   = String(r?.['Gene:Protein'] ?? r?.gp ?? r?.name ?? '').trim();
    const pct  = r?.Proportion_pct ?? r?.Proportion ?? r?.proportion;
    return !!date && !!gp && pct !== null && pct !== undefined && pct !== '' && Number.isFinite(Number(pct));
  });
}

async function fetchSeriesWithAfFallback({ country, gene, afMin = 0.25, afMax = 0.75 }) {
  let last = { rows: [], afMin: Number(afMin), afMax: Number(afMax), found: false };
  for (const [lo, hi] of buildGenomicAfCandidates(afMin, afMax)) {
    const rows = await fetchSeries({ country, gene, afMin: lo, afMax: hi }) || [];
    last = { rows, afMin: lo, afMax: hi, found: genomicRowsHaveMutationData(rows) };
    if (last.found) return last;
  }
  return last;
}

// 把滑桿移到實際使用的範圍，但不觸發重新載入
// Move the slider to the range actually used without triggering a reload
let suppressGenomicSliderSet = false;
function syncGenomicPanelAfRange(afMin, afMax) {
  const api = document.getElementById('slider')?.noUiSlider;
  if (!api?.set) return;

  const values = (api.get() || []).map(Number);
  if (values.length >= 2 && sameAfRange(values[0], values[1], afMin, afMax)) return;

  suppressGenomicSliderSet = true;
  try {
    api.set([afMin, afMax], false);   // false = 不觸發 set 事件 / do not fire 'set'
  } finally {
    suppressGenomicSliderSet = false;
  }
}


/* =====================================================================
   6. 國家、基因選單 / Country and gene menus
   ===================================================================== */

// Global 放最上面，其他國家放在「Countries」群組
// Global goes first; the other countries go in a "Countries" group
async function buildCountrySelect_gene() {
  const select = document.getElementById('genomic-country');
  if (!select) return null;

  const list = await fetchGenomicCountries();
  select.innerHTML = '';

  // "Country (1,234)" → { country, sample }
  const items = list.map(s => {
    const m = /^(.+?)\s*\(([\d,]+)\)\s*$/.exec(String(s));
    return {
      country: m ? m[1].trim() : String(s).trim(),
      sample:  m ? Number(m[2].replace(/,/g, '')) : 0
    };
  });

  const makeOption = ({ country, sample }) => {
    const opt = document.createElement('option');
    opt.value = country;
    opt.text  = `${country} (${sample.toLocaleString('en-US')})`;
    return opt;
  };

  const globalItems  = items.filter(it => it.country === 'Global');
  const countryItems = items.filter(it => it.country !== 'Global');

  globalItems.forEach(it => {
    const opt = makeOption(it);
    opt.style.fontWeight = '700';
    select.appendChild(opt);
  });

  if (countryItems.length) {
    const group = document.createElement('optgroup');
    group.label = globalItems.length
      ? `──────────  ${L_gene('Countries', '國家')}  ──────────`
      : L_gene('Countries', '國家');
    countryItems.forEach(it => group.appendChild(makeOption(it)));
    select.appendChild(group);
  }

  const defaultCountry = globalItems.length ? 'Global' : (select.options[0]?.value || null);
  if (defaultCountry) select.value = defaultCountry;
  return defaultCountry;
}

// 基因選單的順序（依病毒基因體由 5' 到 3'），不在清單內的排在最後
// Gene menu order (5' to 3' along the viral genome); unlisted genes go last
const GENE_ORDER = ['nsp1', 'nsp2', 'nsp3', 'nsp4', 'nsp5', 'nsp6', 'nsp7', 'nsp8', 'nsp9', 'nsp10',
  'nsp12', 'nsp13', 'nsp14', 'nsp15', 'nsp16', 'S', 'ORF3a', 'E', 'M', 'ORF6', 'ORF7a', 'ORF7b', 'ORF8', 'N', 'ORF10'];

// 選單顯示「全名 (縮寫)」；value 仍是縮寫（API 用）
// The menu shows "Full name (abbreviation)"; the value stays the abbreviation (used by the API)
const GENE_NAMES = {
  All:   ['All genes', '全部基因'],
  S:     ['Spike protein', '刺突蛋白'],
  E:     ['Envelope protein', '包膜蛋白'],
  M:     ['Membrane protein', '膜蛋白'],
  N:     ['Nucleocapsid protein', '核殼蛋白'],
  ORF3a: ['Open reading frame 3a', '開放閱讀框 3a'],
  ORF6:  ['Open reading frame 6', '開放閱讀框 6'],
  ORF7a: ['Open reading frame 7a', '開放閱讀框 7a'],
  ORF7b: ['Open reading frame 7b', '開放閱讀框 7b'],
  ORF8:  ['Open reading frame 8', '開放閱讀框 8'],
  ORF10: ['Open reading frame 10', '開放閱讀框 10']
};

function geneLabel(gene) {
  if (gene === 'All') return L_gene(...GENE_NAMES.All);
  const nsp = /^nsp(\d+)$/i.exec(gene);
  const names = nsp
    ? [`Non-structural protein ${nsp[1]}`, `非結構蛋白 ${nsp[1]}`]
    : GENE_NAMES[gene];
  return names ? `${L_gene(...names)} (${gene})` : gene;
}

function sortGenes(genes) {
  const rank = (g) => {
    if (g === 'All') return -1;
    const i = GENE_ORDER.findIndex(x => x.toLowerCase() === String(g).toLowerCase());
    return i >= 0 ? i : GENE_ORDER.length;
  };
  return [...genes].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
}

// 切換語言時更新選單文字 / Update the menu text when the language changes
window.addEventListener('sitelangchange', () => {
  document.querySelectorAll('#genomic-gene option').forEach(opt => {
    opt.textContent = geneLabel(opt.value);
  });
});

// 預設 Gene：保留原本選的（新國家也有時）→ S → All → 第一個
// Default gene: keep the previous one (if the new country has it) → S → All → first
async function buildGeneSelect(country, preferredGene = null) {
  const select = document.getElementById('genomic-gene');
  if (!select) return 'S';

  const genes = sortGenes((await fetchGenes(country)).filter(g => g && String(g).trim()));
  select.innerHTML = '';
  genes.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = geneLabel(g);
    select.appendChild(opt);
  });

  const gene =
    (preferredGene && genes.includes(preferredGene)) ? preferredGene :
    genes.includes('S')   ? 'S' :
    genes.includes('All') ? 'All' :
    (genes[0] || 'S');

  select.value = gene;
  return gene;
}


/* =====================================================================
   7. 折線圖（含 world2） / Line chart (and world2)
   canvasId = 'linearChart-geno'：面板的圖，labels / datasets 由
                                   loadSeriesAndRender() 準備好
                                   panel chart; labels / datasets come from
                                   loadSeriesAndRender()
   canvasId = 'world2'           ：地圖國家視窗，第一個參數是國家名稱，
                                   這裡自己抓資料（Gene S、AF 自動退回）
                                   map modal; the first argument is the
                                   country, and data is fetched here
                                   (Gene S, AF fallback)
   ===================================================================== */
async function renderGeneChart(labels, datasets, canvasId = 'linearChart-geno') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  let world2Af = null;

  if (canvasId === 'world2' && typeof labels === 'string') {
    const country = labels;
    let rows = [];
    world2Af = { min: WORLD2_AF[0], max: WORLD2_AF[1] };
    try {
      const resolved = await fetchSeriesWithAfFallback({
        country, gene: WORLD2_GENE, afMin: WORLD2_AF[0], afMax: WORLD2_AF[1]
      });
      rows = resolved.rows || [];
      world2Af = { min: resolved.afMin, max: resolved.afMax };
    } catch (err) {
      console.error('Failed to load genomic data for the map:', err);
    }

    // 整理成：日期、各變異每日頻率、每日樣本數（同日取最大值）
    // Collect: dates, daily frequency of each variation, daily sample size (max per date)
    const dateSet = new Set();
    const byKey = {};
    const sampleByDate = {};

    rows.forEach(r => {
      const date = String(r.Date ?? r.date ?? '');
      const gp   = r['Gene:Protein'] ?? r.gp ?? r.name;
      if (!date || !gp) return;

      // Proportion_pct（0–100）優先；否則 Proportion（0–1 或 0–100）
      // Prefer Proportion_pct (0–100); otherwise Proportion (0–1 or 0–100)
      let pct = r.Proportion_pct;
      if (pct == null) {
        const p = r.Proportion ?? r.proportion;
        if (p != null) pct = p > 1 ? +p : +p * 100;
      }
      if (pct == null) return;

      dateSet.add(date);
      (byKey[gp] ??= {})[date] = +pct;

      const smp = Number(r.Sample ?? r.sample ?? r.DailySample ?? 0) || 0;
      sampleByDate[date] = Math.max(sampleByDate[date] || 0, smp);
    });

    labels = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
    const keys = Object.keys(byKey);
    ensureColorsFor(keys);

    datasets = [
      // 'Sample Size' 這個名稱 word_country.js 會用來判斷資料種類，畫面上由
      // chart-i18n.js 顯示為「Daily sample size／每日樣本數」
      // word_country.js relies on the name 'Sample Size'; chart-i18n.js
      // displays it as "Daily sample size"
      {
        type: 'bar',
        label: 'Sample Size',
        data: labels.map(d => sampleByDate[d] ?? 0),
        backgroundColor: '#d5d8dc',
        yAxisID: 'y1'
      },
      ...keys.map(k => ({
        type: 'line',
        label: k,
        data: labels.map(d => byKey[k][d] ?? null),
        spanGaps: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        borderColor: colorForGP(k),
        backgroundColor: colorForGP(k)
      }))
    ];
  }

  if (canvasId === 'linearChart-geno') destroyIfExists(genechart);
  else if (canvasId === 'world2') destroyIfExists(world2);

  const hasSampleAxis = (datasets || []).some(ds => ds.yAxisID === 'y1');

  const chart = new Chart(canvas, {
    type: 'bar',
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
          ticks: { maxTicksLimit: 6, maxRotation: 0 }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Variation frequency (%)' },
          min: 0,
          max: 100
        },
        y1: hasSampleAxis ? {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Number of daily samples' },
          grid: { drawOnChartArea: false }
        } : undefined
      },
      plugins: {
        // 面板用下方的自訂圖例；地圖視窗不顯示圖例
        // The panel uses the custom legend below; the map modal shows no legend
        legend: { display: false },
        datalabels: { display: false },
        credit: { text: '©Academia Sinica, Taiwan' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const ds = ctx.dataset;
              if (ds?.yAxisID === 'y1') {
                const n = Math.round(Number(ctx.parsed?.y ?? ctx.raw) || 0);
                return `${L_gene('Daily sample size', '每日樣本數')}: ${n.toLocaleString()}`;
              }
              const y = ctx.parsed?.y;
              return typeof y === 'number' ? `${ds?.label ?? ''}: ${y.toFixed(2)}%` : ctx.formattedValue;
            }
          }
        }
      }
    }
  });

  if (canvasId === 'linearChart-geno') {
    genechart = chart;
    renderCustomLegend(chart);
    document.getElementById('loadingSpinner')?.classList.add('d-none');
  } else if (canvasId === 'world2') {
    // word_country.js 用這兩個值寫副標「latest AF: …」
    // word_country.js uses these for the "latest AF: …" subtitle
    world2 = chart;
    world2.$mapGenomicAfMin = Number(world2Af.min);
    world2.$mapGenomicAfMax = Number(world2Af.max);
  }

  return chart;
}


/* =====================================================================
   8. 圖例 / Legend
   折線圖下方的圖例（不含每日樣本數），點一下隱藏或顯示該條線。
   樣式在 tracking.css 的 .gene-legend。
   Legend under the line chart (without the daily sample size); click an
   item to hide or show its line. Styles: .gene-legend in tracking.css.
   ===================================================================== */
function renderCustomLegend(chart) {
  const container = document.getElementById('linearChart-geno-legend');
  if (!container) return;
  container.innerHTML = '';

  chart.data.datasets
    .filter(ds => ds.yAxisID !== 'y1')
    .forEach(ds => {
      const item = document.createElement('div');
      item.className = 'gene-legend-item' + (ds.hidden ? ' is-hidden' : '');
      item.title = ds.label;

      const swatch = document.createElement('span');
      swatch.className = 'gene-legend-swatch';
      swatch.style.backgroundColor = ds.borderColor;

      const label = document.createElement('span');
      label.className = 'gene-legend-label';
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
   9. 每日前 15 名長條圖 / Daily top 15 bar chart
   ===================================================================== */
function initBarChartGene() {
  const canvas = document.getElementById('barChart-gene');
  if (!canvas) return;
  destroyIfExists(genebarChart);

  genebarChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{ label: 'Variation frequency (%)', data: [], backgroundColor: [], borderColor: [], borderWidth: 1 }]
    },
    options: {
      indexAxis: 'y',
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, min: 0, title: { display: true, text: 'Variation frequency (%)' } }
      },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        credit: { text: '©Academia Sinica, Taiwan' }
      }
    }
  });

  const slider = document.getElementById('progressSlider-gene');
  if (slider) {
    slider.max = Math.max(0, genebarDates.length - 1);
    slider.value = 0;
  }
}

// X 軸上限：當日最大值多留約 15%，再取到 1 / 2 / 2.5 / 5 / 10 的倍數
// X-axis maximum: about 15% above the day's maximum, rounded up to 1 / 2 / 2.5 / 5 / 10
function niceMax(v) {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const target = Math.min(100, v * 1.15);
  const mag  = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return Math.min(100, step * mag);
}

function updateBarChartGene(date) {
  if (!genebarChart || !date) return;
  const arr = genebarDataByDate[date] || [];

  const dayMax = arr.length ? Math.max(...arr.map(d => Number(d.value) || 0)) : 0;
  genebarChart.options.scales.x.max = niceMax(dayMax);

  const ds = genebarChart.data.datasets[0];
  genebarChart.data.labels = arr.map(d => d.label);
  ds.data            = arr.map(d => d.value);
  ds.backgroundColor = arr.map(d => d.color);
  ds.borderColor     = arr.map(d => d.color);
  genebarChart.update();

  const lbl = document.getElementById('barDateLabel-gene');
  if (lbl) lbl.textContent = date;
  const slider = document.getElementById('progressSlider-gene');
  if (slider) slider.value = genebarIndex;
}

// 每 60 毫秒前進一天，到最後一天自動停止；已在最後一天時從頭播
// Advance one day every 60 ms and stop at the last day; restart from day 1 if already there
function startBarAnimation_gene() {
  if (genebarTimer || !genebarDates.length) return;
  if (genebarIndex >= genebarDates.length - 1) genebarIndex = 0;

  genebarTimer = setInterval(() => {
    if (genebarIndex >= genebarDates.length - 1) {
      pauseBarAnimation_gene();
      return;
    }
    genebarIndex++;
    updateBarChartGene(genebarDates[genebarIndex]);
  }, 60);

  const btn = document.getElementById('toggleBarPlay-gene');
  if (btn) btn.textContent = '⏸';
}

function pauseBarAnimation_gene() {
  if (genebarTimer) clearInterval(genebarTimer);
  genebarTimer = null;
  const btn = document.getElementById('toggleBarPlay-gene');
  if (btn) btn.textContent = '▶';
}


/* =====================================================================
   10. 面板載入流程 / Panel loading
   loadGenomicPanelData() 是面板唯一的入口：先決定 AF 範圍，
   折線圖與每日長條圖再使用同一個範圍。
   loadGenomicPanelData() is the only entry point for the panel: it settles
   the AF range first, then both charts use that range.
   ===================================================================== */

// 只處理面板目前選的國家；地圖視窗帶別的國家進來時忽略
// Only handle the country selected in the panel; ignore other countries from the map
function isGenomicPanelCountry(country) {
  const panel = document.getElementById('genomic-country')?.value;
  return !panel || panel === country;
}

async function loadSeriesAndRender({ country, rows }) {
  if (!isGenomicPanelCountry(country)) return;

  const dateSet = new Set();
  const sampleByDate = {};
  const lineMap = {};   // 'Gene:Protein' → { date → % }

  rows.forEach(r => {
    const date = String(r.Date || '').split('T')[0];
    if (!date) return;
    const gp = r['Gene:Protein'] || '';

    dateSet.add(date);
    if (!(date in sampleByDate)) sampleByDate[date] = Number(r.Sample) || 0;   // 同日只記一次 / once per date
    (lineMap[gp] ??= {})[date] = Number(r.Proportion_pct) || 0;
  });

  const gpKeys = Object.keys(lineMap).sort();
  ensureColorsFor(gpKeys);
  const labels = [...dateSet].sort();

  // 'Sample Size'：見 renderGeneChart 的說明 / see the note in renderGeneChart
  const datasets = [{
    type: 'bar',
    label: 'Sample Size',
    data: labels.map(d => sampleByDate[d] || 0),
    backgroundColor: '#d5d8dc',
    yAxisID: 'y1'
  }];
  gpKeys.forEach(gp => {
    const color = colorForGP(gp);
    datasets.push({
      type: 'line',
      label: gp,
      data: labels.map(d => lineMap[gp][d] ?? 0),
      yAxisID: 'y',
      borderColor: color,
      backgroundColor: color,
      spanGaps: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2
    });
  });

  geneCurrentCountry = country;
  renderGeneChart(labels, datasets, 'linearChart-geno');
}

async function loadHistogramAndPrepare({ country, gene, afMin, afMax }) {
  if (!isGenomicPanelCountry(country)) return;
  const rows = await fetchHistogramTop15({ country, gene, afMin, afMax });

  const byDate = {};
  const gpSet = new Set();

  rows.forEach(r => {
    const date = String(r.Date || '').split('T')[0];
    if (!date) return;
    const gp = r['Gene:Protein'] || '';
    gpSet.add(gp);
    (byDate[date] ??= []).push({
      gp,
      label: r.Variation ? `${r.Variation} (${gp})` : gp,
      value: Number(r.Proportion_pct) || 0
    });
  });

  ensureColorsFor([...gpSet]);

  // 每天依頻率排序，只留前 15 名 / Sort each day by frequency and keep the top 15
  Object.keys(byDate).forEach(d => {
    byDate[d] = byDate[d]
      .map(item => ({ label: item.label, value: item.value, color: colorForGP(item.gp) }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 15);
  });
  genebarDataByDate = byDate;

  // 從第一個有數值的日期開始 / Start from the first date with a value
  const allDates = Object.keys(byDate).sort();
  const firstIdx = allDates.findIndex(d => byDate[d].some(item => item.value > 0));
  genebarDates = firstIdx >= 0 ? allDates.slice(firstIdx) : allDates;

  pauseBarAnimation_gene();
  genebarIndex = 0;
  initBarChartGene();
  if (genebarDates.length) updateBarChartGene(genebarDates[0]);
}

async function loadGenomicPanelData({ country, gene, afMin = 0.25, afMax = 0.75 }) {
  if (!isGenomicPanelCountry(country)) return null;
  document.getElementById('loadingSpinner')?.classList.remove('d-none');

  const resolved = await fetchSeriesWithAfFallback({ country, gene, afMin, afMax });
  if (!isGenomicPanelCountry(country)) return null;

  syncGenomicPanelAfRange(resolved.afMin, resolved.afMax);

  const q = { country, gene, afMin: resolved.afMin, afMax: resolved.afMax };
  await Promise.all([
    loadSeriesAndRender({ country, rows: resolved.rows }),
    loadHistogramAndPrepare(q)
  ]);
  return resolved;
}


/* =====================================================================
   11. Latest AF 滑桿 / Latest AF slider
   拖曳時更新文字；放開時重新載入兩張圖。
   The label updates while dragging; both charts reload on release.
   ===================================================================== */
function initAFSlider() {
  const slider = document.getElementById('slider');
  if (!slider || typeof noUiSlider === 'undefined') return;

  noUiSlider.create(slider, {
    start: [0.25, 0.75],
    connect: true,
    range: { min: 0, max: 1 },
    step: 0.005,
    tooltips: [
      { to: v => (+v).toFixed(3), from: v => +v },
      { to: v => (+v).toFixed(3), from: v => +v }
    ]
  });

  const valueDiv = document.getElementById('slider-value');
  const showRange = () => {
    const [v0, v1] = slider.noUiSlider.get().map(parseFloat);
    if (valueDiv) {
      valueDiv.textContent =
        `${L_gene('Latest allele frequency (AF)', '最新等位基因頻率 (AF)')}: ${v0.toFixed(3)} – ${v1.toFixed(3)}`;
    }
  };
  slider.noUiSlider.on('update', showRange);
  window.addEventListener('sitelangchange', showRange);

  slider.noUiSlider.on('set', async () => {
    if (suppressGenomicSliderSet) return;
    const [afMin, afMax] = slider.noUiSlider.get().map(parseFloat);
    const country = document.getElementById('genomic-country')?.value || 'Global';
    const gene    = document.getElementById('genomic-gene')?.value || 'S';
    await loadGenomicPanelData({ country, gene, afMin, afMax });
  });
}


/* =====================================================================
   12. 初始化 / Start-up
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // 每日長條圖：播放 / 暫停、拖曳滑桿
  // Daily bar chart: play / pause and the date slider
  document.getElementById('toggleBarPlay-gene')?.addEventListener('click', () => {
    if (genebarTimer) pauseBarAnimation_gene();
    else startBarAnimation_gene();
  });
  document.getElementById('progressSlider-gene')?.addEventListener('input', function () {
    pauseBarAnimation_gene();
    genebarIndex = +this.value;
    updateBarChartGene(genebarDates[genebarIndex]);
  });

  window.addEventListener('resize', () => {
    genechart?.resize();
    world2?.resize();
    genebarChart?.resize();
  });

  initAFSlider();

  // 國家 → 基因 → 資料；換國家或 Gene 時都從 AF 0.25–0.75 開始查
  // Country → gene → data; changing the country or gene starts again from AF 0.25–0.75
  try {
    const country = await buildCountrySelect_gene() || 'Global';
    const gene = await buildGeneSelect(country);

    document.getElementById('genomic-country')?.addEventListener('change', async (e) => {
      const newCountry = e.target.value;
      const prevGene = document.getElementById('genomic-gene')?.value || null;
      const newGene = await buildGeneSelect(newCountry, prevGene);
      await loadGenomicPanelData({ country: newCountry, gene: newGene });
    });

    document.getElementById('genomic-gene')?.addEventListener('change', async (e) => {
      const panelCountry = document.getElementById('genomic-country')?.value || 'Global';
      await loadGenomicPanelData({ country: panelCountry, gene: e.target.value });
    });

    await loadGenomicPanelData({ country, gene });
  } catch (err) {
    console.error('Failed to start the genomic panel:', err);
  } finally {
    document.getElementById('loadingSpinner')?.classList.add('d-none');
  }
});