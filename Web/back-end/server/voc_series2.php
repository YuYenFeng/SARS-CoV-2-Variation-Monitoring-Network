<?php
// voc_series2.php — VOC：所選 VOC 的譜系每日頻率
//                   VOC: daily frequency of each sublineage of the selected VOCs
// GET  country   國家，預設 Global / country, default Global
//      variants  逗號分隔，預設 Omicron，例如 Omicron,Delta / comma-separated, default Omicron
//      afMin     Latest AF 下限，預設 0 / lower Latest AF bound, default 0
//      afMax     Latest AF 上限，預設 1 / upper Latest AF bound, default 1
// 回傳 / Returns  [{ Date, Variant:Lineage, Proportion_pct }]
require_once dirname(__DIR__) . '/chartData.php';
ini_set('memory_limit', '512M');   // Global 的資料量大 / Global returns many rows

try {
    send_json(getVocVariantLineageSeries($pdo, [
        'country'  => param_str('country', 'Global'),
        'variants' => param_list('variants', ['Omicron']),
        'afMin'    => param_float('afMin', 0.0),
        'afMax'    => param_float('afMax', 1.0),
    ]));
} catch (Throwable $e) {
    send_error($e, 'voc_series2');
}
