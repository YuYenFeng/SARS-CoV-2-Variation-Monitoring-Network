<?php
// genomic_histogram_top15.php — 基因體變異：每天頻率最高的 15 個變異
//                               Genomic variation: the 15 most frequent variations per day
// GET  country, gene（預設 All / default All）, afMin, afMax — 同 genomic_series.php / as in genomic_series.php
// 回傳 / Returns  [{ Date, Variation, Gene:Protein, Proportion_pct }]
require_once dirname(__DIR__) . '/chartData.php';

try {
    send_json(getGenomicHistogramTop15($pdo, [
        'country' => param_str('country', 'Global'),
        'gene'    => param_str('gene', 'All'),
        'afMin'   => param_float('afMin', GENOMIC_AF_MIN),
        'afMax'   => param_float('afMax', GENOMIC_AF_MAX),
    ]));
} catch (Throwable $e) {
    send_error($e, 'genomic_histogram_top15');
}
