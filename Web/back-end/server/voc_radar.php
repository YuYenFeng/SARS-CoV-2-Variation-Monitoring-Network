<?php
// voc_radar.php — VOC 組成圖：各 VOC 與譜系的序列總數（整體，不分日期）
//                 VOC composition: sequence totals per VOC and sublineage (overall, no dates)
// GET  country   國家，預設 Global / country, default Global
// 回傳 / Returns  [{ Variant, Lineage, LineageSample, VariantSample, CountrySample,
//                    LineageWithinVariant_pct, VariantCountry_pct }]
// 欄位說明見 chartData.php 的 getVocRadar() / Field notes: getVocRadar() in chartData.php
require_once dirname(__DIR__) . '/chartData.php';

try {
    send_json(getVocRadar($pdo, ['country' => param_str('country', 'Global')]));
} catch (Throwable $e) {
    send_error($e, 'voc_radar');
}
