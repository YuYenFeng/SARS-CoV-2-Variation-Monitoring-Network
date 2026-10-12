<?php
// sixtype_series.php — 六型病毒株：每日各類型比例與樣本數
//                      Six Strain Types: daily proportion of each type and sample size
// GET  country   國家，預設 Global / country, default Global
// 回傳 / Returns  [{ Date, Type, Proportion_pct, Sample }]
require_once dirname(__DIR__) . '/chartData.php';

try {
    send_json(getSixTypeSeries($pdo, ['country' => param_str('country', 'Global')]));
} catch (Throwable $e) {
    send_error($e, 'sixtype_series');
}
