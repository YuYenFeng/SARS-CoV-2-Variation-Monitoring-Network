<?php
// genomic_series.php — 基因體變異：每日頻率（折線圖）與每日樣本數
//                      Genomic variation: daily frequencies (line chart) and daily sample size
// GET  country   國家，預設 Global / country, default Global
//      gene      基因，預設 S；All = 全部 / gene, default S; All = every gene
//      afMin     Latest AF 下限，預設 0.25 / lower Latest AF bound, default 0.25
//      afMax     Latest AF 上限，預設 0.75 / upper Latest AF bound, default 0.75
// 回傳 / Returns  [{ Date, Variation, Gene:Protein, Proportion_pct, Sample }]
require_once dirname(__DIR__) . '/chartData.php';
ini_set('memory_limit', '512M');   // Global 的資料量大 / Global returns many rows

try {
    send_json(getGenomicSeries($pdo, [
        'country' => param_str('country', 'Global'),
        'gene'    => param_str('gene', 'S'),
        'afMin'   => param_float('afMin', GENOMIC_AF_MIN),
        'afMax'   => param_float('afMax', GENOMIC_AF_MAX),
    ]));
} catch (Throwable $e) {
    send_error($e, 'genomic_series');
}
