<?php
// voc_series.php — VOC：各 VOC 每日頻率與每日樣本數
//                  VOC: daily frequency of each VOC and daily sample size
// GET  country   國家，預設 Global / country, default Global
// 回傳 / Returns  [{ Date, Variant, Proportion_pct, Sample }]
require_once dirname(__DIR__) . '/chartData.php';
ini_set('memory_limit', '512M');   // Global 的資料量大 / Global returns many rows

try {
    send_json(getVocSeries($pdo, ['country' => param_str('country', 'Global')]));
} catch (Throwable $e) {
    send_error($e, 'voc_series');
}
