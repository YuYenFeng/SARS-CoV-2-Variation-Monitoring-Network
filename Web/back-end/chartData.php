<?php
/* =====================================================================
   chartData.php
   Tracking 頁各圖表的資料查詢。每個函式對應 server/ 底下的一支 API。
   Data queries for the Tracking page charts. Each function backs one API
   file in server/.

   函式 / Functions                 API（server/）               圖表 / Chart
     getSixTypeSeries               sixtype_series.php           六型病毒株 / Six Strain Types
     getGenomicSeries               genomic_series.php           基因體變異折線圖 / Genomic line chart
     getGenomicHistogramTop15       genomic_histogram_top15.php  基因體變異每日前 15 名 / Genomic daily top 15
     getVocSeries                   voc_series.php               VOC 頻率 / VOC frequencies
     getVocVariantLineageSeries     voc_series2.php              譜系頻率 / Sublineage frequencies
     getVocHistogramTop10           voc_histogram_top10.php      每日前 10 名譜系 / Daily top 10 sublineages
     getVocRadar                    voc_radar.php                VOC 組成圖 / VOC composition

   比例一律回傳百分比（0–100，小數兩位），欄位名稱 Proportion_pct。
   Proportions are always returned as percentages (0–100, two decimals) in Proportion_pct.
   ===================================================================== */

require_once __DIR__ . '/common.php';

// Genomic 預設的 Latest AF 範圍 / Default Latest AF range for Genomic
const GENOMIC_AF_MIN = 0.25;
const GENOMIC_AF_MAX = 0.75;

// VOC 固定 6 類，順序即圖例順序（Others 放最後）
// The six fixed VOC groups, in legend order (Others last)
const VOC_ORDER = ['Alpha', 'Beta', 'Delta', 'Gamma', 'Omicron', 'Others'];

// SQL 的 FIELD() 排序用：'Alpha','Beta',… / For ORDER BY FIELD(): 'Alpha','Beta',…
function vocOrderList(): string {
    return "'" . implode("','", VOC_ORDER) . "'";
}

// IN (?, ?, …) 的佔位符 / Placeholders for IN (?, ?, …)
function placeholders(array $items): string {
    return implode(',', array_fill(0, count($items), '?'));
}


/* =====================================================================
   1. 六型病毒株 / Six Strain Types
   每日各類型比例；Sample = 該國當日樣本數（同一天每列相同）。
   Daily proportion per type; Sample = the country's daily sample size
   (the same on every row of a date).
   回傳 / Returns: [{ Date, Type, Proportion_pct, Sample }]
   ===================================================================== */
function getSixTypeSeries(PDO $pdo, array $opts = []): array {
    $country = $opts['country'] ?? 'Global';
    return run_query($pdo, "
      SELECT
        s.Date AS Date,
        s.Type AS Type,
        ROUND(s.Proportion * 100, 2) AS Proportion_pct,
        MAX(s.Sample) OVER (PARTITION BY s.Country, s.Date) AS Sample
      FROM sars_cov_2026.straintype s
      WHERE s.Country = ?
      ORDER BY s.Date, s.Type
    ", [$country]);
}


/* =====================================================================
   2. 基因體變異 / Emerging Genomic Variation
   只取最新等位基因頻率（LatestAF）在範圍內的變異；gene = 'All' 表示不限基因。
   Only variations whose latest allele frequency (LatestAF) is in range;
   gene = 'All' means any gene.
   ===================================================================== */

// 共用的 WHERE 條件與參數 / Shared WHERE clause and parameters
function genomicFilter(array $opts, string $defaultGene): array {
    $country = $opts['country'] ?? 'Global';
    $gene    = $opts['gene']    ?? $defaultGene;
    $afMin   = isset($opts['afMin']) ? (float)$opts['afMin'] : GENOMIC_AF_MIN;
    $afMax   = isset($opts['afMax']) ? (float)$opts['afMax'] : GENOMIC_AF_MAX;

    $where  = 'n.Country = ? AND n.LatestAF BETWEEN ? AND ?';
    $params = [$country, $afMin, $afMax];
    if ($gene !== '' && $gene !== 'All') {
        $where   .= ' AND n.Gene = ?';
        $params[] = $gene;
    }
    return [$where, $params];
}

// 每日頻率（折線）+ 每日樣本數（取自預先彙總的 daily_sample）
// Daily frequencies (lines) + daily sample size (from the pre-aggregated daily_sample)
// 回傳 / Returns: [{ Date, Variation, Gene:Protein, Proportion_pct, Sample }]
function getGenomicSeries(PDO $pdo, array $opts = []): array {
    [$where, $params] = genomicFilter($opts, 'S');
    return run_query($pdo, "
      SELECT
        g.Date,
        g.Variation,
        CONCAT(COALESCE(n.Gene, ''), ':', COALESCE(n.Protein, '')) AS `Gene:Protein`,
        ROUND(g.Proportion * 100, 2) AS Proportion_pct,
        ds.daily_sample AS Sample
      FROM sars_cov_2026.data_nt_info AS n
      STRAIGHT_JOIN sars_cov_2026.genomic AS g
        ON g.Country = n.Country AND g.Variation = n.Variation
      JOIN sars_cov_2026.daily_sample AS ds
        ON ds.Country = g.Country AND ds.Date = g.Date
      WHERE {$where}
      ORDER BY g.Date, Proportion_pct DESC, g.Variation
    ", $params);
}

// 每天頻率最高的 15 個變異 / The 15 most frequent variations per day
// 回傳 / Returns: [{ Date, Variation, Gene:Protein, Proportion_pct }]
function getGenomicHistogramTop15(PDO $pdo, array $opts = []): array {
    [$where, $params] = genomicFilter($opts, 'All');
    return run_query($pdo, "
      WITH ranked AS (
        SELECT
          g.Date,
          g.Variation,
          CONCAT(COALESCE(n.Gene, ''), ':', COALESCE(n.Protein, '')) AS `Gene:Protein`,
          ROUND(g.Proportion * 100, 2) AS Proportion_pct,
          ROW_NUMBER() OVER (PARTITION BY g.Date ORDER BY g.Proportion DESC, g.Variation) AS rn
        FROM sars_cov_2026.data_nt_info AS n
        STRAIGHT_JOIN sars_cov_2026.genomic AS g
          ON g.Country = n.Country AND g.Variation = n.Variation
        WHERE {$where}
      )
      SELECT Date, Variation, `Gene:Protein`, Proportion_pct
      FROM ranked
      WHERE rn <= 15
      ORDER BY Date, Proportion_pct DESC, Variation
    ", $params);
}


/* =====================================================================
   3. VOC 追蹤 / Variant of Concern (VOC) Tracking
   ===================================================================== */

// 各 VOC 每日頻率 + 每日樣本數 / Daily frequency of each VOC + daily sample size
// 回傳 / Returns: [{ Date, Variant, Proportion_pct, Sample }]
function getVocSeries(PDO $pdo, array $opts = []): array {
    $country = $opts['country'] ?? 'Global';
    return run_query($pdo, "
      SELECT
        v.Date AS Date,
        v.Variant AS Variant,
        ROUND(v.Proportion * 100, 2) AS Proportion_pct,
        MAX(v.Sample) OVER (PARTITION BY v.Country, v.Date) AS Sample
      FROM voc_data v
      WHERE v.Country = ?
      ORDER BY v.Date, FIELD(v.Variant, " . vocOrderList() . ")
    ", [$country]);
}

// 所選 VOC 的譜系每日頻率 / Daily frequency of each sublineage of the selected VOCs
// 回傳 / Returns: [{ Date, Variant:Lineage, Proportion_pct }]
function getVocVariantLineageSeries(PDO $pdo, array $opts = []): array {
    $country  = $opts['country']  ?? 'Global';
    $variants = $opts['variants'] ?? ['Omicron'];
    $afMin    = isset($opts['afMin']) ? (float)$opts['afMin'] : 0.0;
    $afMax    = isset($opts['afMax']) ? (float)$opts['afMax'] : 1.0;
    if (!$variants) return [];

    return run_query($pdo, "
      SELECT
        vs.Date,
        CONCAT(vs.Variant, ':', vs.Lineage) AS `Variant:Lineage`,
        ROUND(vs.Proportion * 100, 2)       AS Proportion_pct
      FROM voc_data_sub vs
      JOIN voc_data_info vi
        ON vi.Country = vs.Country AND vi.Variant = vs.Variant AND vi.Lineage = vs.Lineage
      WHERE vi.Country = ?
        AND vi.LatestAF BETWEEN ? AND ?
        AND vi.Variant IN (" . placeholders($variants) . ")
      ORDER BY vs.Date, `Variant:Lineage`
    ", array_merge([$country, $afMin, $afMax], $variants));
}

// 每天比例最高的 10 個譜系（不篩 AF）；minSample > 0 時排除當日樣本數太少的日期
// The 10 sublineages with the highest proportion per day (no AF filter);
// with minSample > 0, days with too few samples are skipped
// 回傳 / Returns: [{ Date, Variant, Lineage, Variant:Lineage, Proportion_pct, DailySample }]
function getVocHistogramTop10(PDO $pdo, array $opts = []): array {
    $country   = $opts['country']  ?? 'Global';
    $variants  = $opts['variants'] ?? VOC_ORDER;
    $minSample = (int)($opts['minSample'] ?? 0);
    if (!$variants) return [];

    $params = array_merge([$country], $variants);
    $sampleCond = '';
    if ($minSample > 0) {
        $sampleCond = 'AND vs.Sample >= ?';
        $params[] = $minSample;
    }

    return run_query($pdo, "
      WITH ranked AS (
        SELECT
          vs.Date, vs.Variant, vs.Lineage, vs.Proportion, vs.Sample,
          ROW_NUMBER() OVER (PARTITION BY vs.Date ORDER BY vs.Proportion DESC, vs.Variant, vs.Lineage) AS rn
        FROM voc_data_sub vs
        WHERE vs.Country = ?
          AND vs.Variant IN (" . placeholders($variants) . ")
          AND vs.Proportion > 0
          {$sampleCond}
      )
      SELECT
        Date,
        Variant,
        Lineage,
        CONCAT(Variant, ':', Lineage) AS `Variant:Lineage`,
        ROUND(Proportion * 100, 2)    AS Proportion_pct,
        Sample                        AS DailySample
      FROM ranked
      WHERE rn <= 10
      ORDER BY Date, Proportion_pct DESC, `Variant:Lineage`
    ", $params);
}

// VOC 組成圖（整體，不分日期，資料來自 voc_data_info）
// VOC composition (overall, no dates, from voc_data_info)
//   LineageSample             該譜系的序列數 / sequences of the sublineage
//   VariantSample             該 VOC 所有譜系加總 / sum over the VOC's sublineages
//   CountrySample             該國所有 VOC 加總 / sum over all VOCs in the country
//   LineageWithinVariant_pct  譜系占該 VOC 的比例 / sublineage share within its VOC
//   VariantCountry_pct        VOC 占該國的比例 / VOC share within the country
function getVocRadar(PDO $pdo, array $opts = []): array {
    $country = $opts['country'] ?? 'Global';
    return run_query($pdo, "
      WITH lineage AS (
        SELECT Variant, Lineage, SUM(Sample) AS LineageSample
        FROM voc_data_info
        WHERE Country = ?
        GROUP BY Variant, Lineage
      ),
      variant_totals AS (
        SELECT Variant, SUM(LineageSample) AS VariantSample
        FROM lineage
        GROUP BY Variant
      ),
      country_total AS (
        SELECT SUM(LineageSample) AS CountrySample FROM lineage
      )
      SELECT
        l.Variant,
        l.Lineage,
        l.LineageSample,
        vt.VariantSample,
        ct.CountrySample,
        ROUND(l.LineageSample / NULLIF(vt.VariantSample, 0) * 100, 2) AS LineageWithinVariant_pct,
        ROUND(vt.VariantSample / NULLIF(ct.CountrySample, 0) * 100, 2) AS VariantCountry_pct
      FROM lineage l
      JOIN variant_totals vt ON vt.Variant = l.Variant
      CROSS JOIN country_total ct
      ORDER BY FIELD(l.Variant, " . vocOrderList() . "), l.LineageSample DESC, l.Lineage
    ", [$country]);
}
