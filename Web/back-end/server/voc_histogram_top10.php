<?php
// voc_histogram_top10.php — VOC：每天比例最高的 10 個譜系（全部日期一次回傳）
//                           VOC: the 10 sublineages with the highest proportion per day (all dates at once)
// GET  country    國家，預設 Global / country, default Global
//      variants   逗號分隔，預設全部 6 類 / comma-separated, default all six groups
//      minSample  當日樣本數低於此值的日期不納入，預設 0（不篩） / skip days with fewer samples, default 0 (no filter)
// 回傳 / Returns  [{ Date, Variant, Lineage, Variant:Lineage, Proportion_pct, DailySample }]
require_once dirname(__DIR__) . '/chartData.php';

try {
    send_json(getVocHistogramTop10($pdo, [
        'country'   => param_str('country', 'Global'),
        'variants'  => param_list('variants', VOC_ORDER),
        'minSample' => param_int('minSample', 0),
    ]));
} catch (Throwable $e) {
    send_error($e, 'voc_histogram_top10');
}
