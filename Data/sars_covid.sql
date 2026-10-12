-- =====================================================================
-- SARS-CoV-2 Variation Monitoring Network — database schema
-- 資料庫結構（僅結構，不含資料）
-- MySQL 8.0+, utf8mb4
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;


-- ---------------------------------------------------------------------
-- Shared: total samples per country for each module (country menus)
-- 共用：各國家在各模組的樣本總數（國家選單用）
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `country_sample`;
CREATE TABLE `country_sample` (
  `Country`                 varchar(100) NOT NULL,
  `strainType_total_Sample` int NOT NULL,
  `genomic_total_Sample`    int NOT NULL,
  `voc_total_Sample`        int NOT NULL,
  `css_total_Sample`        int DEFAULT NULL,
  `css_max_Sample`          int NOT NULL DEFAULT '0',
  PRIMARY KEY (`Country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------------------------------------------------------------------
-- Six strain types: daily proportion per country and type
-- 六大病毒株類型：各國家、各類型的每日比例
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `straintype`;
CREATE TABLE `straintype` (
  `Country`    varchar(100) NOT NULL,
  `Type`       varchar(45) NOT NULL,
  `Date`       date NOT NULL,
  `Proportion` double NOT NULL,
  `Sample`     int NOT NULL,
  PRIMARY KEY (`Country`,`Type`,`Date`),
  CONSTRAINT `Country_straintype` FOREIGN KEY (`Country`) REFERENCES `country_sample` (`Country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------------------------------------------------------------------
-- Emerging genomic variation
-- 新興基因體變異
-- ---------------------------------------------------------------------

-- Variation annotation: position, gene, protein, allele frequency
-- 變異註解：位置、基因、蛋白質、等位基因頻率
DROP TABLE IF EXISTS `data_nt_info`;
CREATE TABLE `data_nt_info` (
  `Country`   varchar(64) NOT NULL,
  `Variation` varchar(24) NOT NULL,
  `Position`  int unsigned NOT NULL,
  `Gene`      varchar(32) DEFAULT NULL,
  `Protein`   varchar(32) DEFAULT NULL,
  `AF`        float DEFAULT NULL,
  `LatestAF`  float DEFAULT NULL,
  PRIMARY KEY (`Country`,`Variation`),
  KEY `idx_gene` (`Country`,`Gene`),
  KEY `idx_pos` (`Position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Daily frequency of each variation
-- 各變異的每日頻率
DROP TABLE IF EXISTS `genomic`;
CREATE TABLE `genomic` (
  `Country`    varchar(64) NOT NULL,
  `Variation`  varchar(24) NOT NULL,
  `Date`       date NOT NULL,
  `Proportion` float NOT NULL DEFAULT '0',
  `Sample`     int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`Country`,`Variation`,`Date`),
  KEY `idx_cds` (`Country`,`Date`,`Sample`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Daily sample size per country
-- 各國家每日樣本數
DROP TABLE IF EXISTS `daily_sample`;
CREATE TABLE `daily_sample` (
  `Country`      varchar(64) NOT NULL,
  `Date`         date NOT NULL,
  `daily_sample` int unsigned NOT NULL,
  PRIMARY KEY (`Country`,`Date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------------------------------------------------------------------
-- Variants of concern (VOC)
-- 關注變異株
-- ---------------------------------------------------------------------

-- Daily VOC frequency
-- 各 VOC 的每日頻率
DROP TABLE IF EXISTS `voc_data`;
CREATE TABLE `voc_data` (
  `Country`    varchar(100) NOT NULL,
  `Variant`    varchar(45) NOT NULL,
  `Date`       date NOT NULL,
  `Proportion` double NOT NULL,
  `Sample`     int NOT NULL,
  PRIMARY KEY (`Country`,`Variant`,`Date`),
  CONSTRAINT `Country_voc_data` FOREIGN KEY (`Country`) REFERENCES `country_sample` (`Country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Daily sublineage frequency within each VOC
-- 各 VOC 底下子譜系的每日頻率
DROP TABLE IF EXISTS `voc_data_sub`;
CREATE TABLE `voc_data_sub` (
  `Country`    varchar(100) NOT NULL,
  `Variant`    varchar(45) NOT NULL,
  `Lineage`    varchar(45) NOT NULL,
  `Date`       date NOT NULL,
  `Proportion` double NOT NULL,
  `Sample`     int NOT NULL,
  PRIMARY KEY (`Country`,`Variant`,`Lineage`,`Date`),
  CONSTRAINT `Country_voc_data_sub` FOREIGN KEY (`Country`) REFERENCES `country_sample` (`Country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sublineage summary: latest frequency and cumulative samples
-- 子譜系摘要：最新頻率與累計樣本數
DROP TABLE IF EXISTS `voc_data_info`;
CREATE TABLE `voc_data_info` (
  `Country`  varchar(100) NOT NULL,
  `Lineage`  varchar(45) NOT NULL,
  `Variant`  varchar(45) NOT NULL,
  `LatestAF` double NOT NULL,
  `Sample`   int NOT NULL,
  PRIMARY KEY (`Country`,`Lineage`,`Variant`),
  CONSTRAINT `Country_voc_data_info` FOREIGN KEY (`Country`) REFERENCES `country_sample` (`Country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------------------------------------------------------------------
-- Correlated SNV sets (CSS)
-- 相關 SNV 組合
-- ---------------------------------------------------------------------

-- Country lookup
-- 國家代碼對照
DROP TABLE IF EXISTS `css_country`;
CREATE TABLE `css_country` (
  `country_id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `country`    varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`country_id`),
  UNIQUE KEY `uk_country` (`country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per CSS: Pango lineage, first appearance, nt/aa haplotype
-- 每個 CSS 一筆：Pango 譜系、首次出現日期、核苷酸／胺基酸單倍型
DROP TABLE IF EXISTS `css_haplotype`;
CREATE TABLE `css_haplotype` (
  `hap_id`            int unsigned NOT NULL AUTO_INCREMENT,
  `uid`               varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pango`             varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pango_prop`        float DEFAULT NULL,
  `first_appear_date` date DEFAULT NULL,
  `nt_haplotype`      text COLLATE utf8mb4_unicode_ci NOT NULL,
  `aa_haplotype`      text COLLATE utf8mb4_unicode_ci,
  `nt_hash`           binary(16) NOT NULL,
  PRIMARY KEY (`hap_id`),
  UNIQUE KEY `uk_uid` (`uid`),
  KEY `idx_nt_hash` (`nt_hash`),
  KEY `idx_pango` (`pango`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SNVs that make up each CSS
-- 組成每個 CSS 的 SNV
DROP TABLE IF EXISTS `css_snv`;
CREATE TABLE `css_snv` (
  `hap_id`    int unsigned NOT NULL,
  `snv`       varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gene`      varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aa_change` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`hap_id`,`snv`),
  KEY `idx_snv` (`snv`),
  KEY `idx_gene` (`gene`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ranking metrics per scope and country
-- (strain count, LD, S-gene count, persistence, growth slopes, deletions)
-- 各範圍、各國家的排名指標
-- （株數、LD、S 基因數、持續指數、成長斜率、缺失數）
DROP TABLE IF EXISTS `css_rank`;
CREATE TABLE `css_rank` (
  `scope`             varchar(64) NOT NULL,
  `hap_id`            int unsigned NOT NULL,
  `country_id`        smallint unsigned NOT NULL,
  `pango_prop`        float DEFAULT NULL,
  `n_strains`         int unsigned DEFAULT NULL,
  `first_appear_date` date DEFAULT NULL,
  `group_name`        varchar(128) DEFAULT NULL,
  `n_strains_world`   bigint unsigned DEFAULT NULL,
  `rank_strain`       int DEFAULT NULL,
  `ld`                float DEFAULT NULL,
  `rank_ld`           int DEFAULT NULL,
  `s_count`           int DEFAULT NULL,
  `rank_s`            int DEFAULT NULL,
  `persistent_index`  float DEFAULT NULL,
  `rank_p`            int DEFAULT NULL,
  `slope_3_month`     float DEFAULT NULL,
  `rank_3_month`      int DEFAULT NULL,
  `slope_1_month`     float DEFAULT NULL,
  `rank_1_month`      int DEFAULT NULL,
  `slope_14_day`      float DEFAULT NULL,
  `rank_14_day`       int DEFAULT NULL,
  `del_count`         int DEFAULT NULL,
  `rank_del`          int DEFAULT NULL,
  PRIMARY KEY (`scope`,`hap_id`,`country_id`),
  KEY `idx_scope_country_rank` (`scope`,`country_id`,`rank_strain`),
  KEY `idx_hap` (`hap_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Daily count and smoothed prevalence of each CSS (partitioned by year)
-- 各 CSS 的每日數量與平滑盛行率（依年份分區）
DROP TABLE IF EXISTS `css_smooth`;
CREATE TABLE `css_smooth` (
  `hap_id`              int unsigned NOT NULL,
  `country_id`          smallint unsigned NOT NULL,
  `collection_date`     date NOT NULL,
  `cnt`                 int unsigned DEFAULT NULL,
  `total`               int unsigned DEFAULT NULL,
  `smoothed_proportion` float DEFAULT NULL,
  `proportion`          double GENERATED ALWAYS AS ((`cnt` / nullif(`total`,0))) VIRTUAL,
  PRIMARY KEY (`hap_id`,`country_id`,`collection_date`),
  KEY `idx_country_date` (`country_id`,`collection_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (year(`collection_date`)) (
  PARTITION p2019 VALUES LESS THAN (2020),
  PARTITION p2020 VALUES LESS THAN (2021),
  PARTITION p2021 VALUES LESS THAN (2022),
  PARTITION p2022 VALUES LESS THAN (2023),
  PARTITION p2023 VALUES LESS THAN (2024),
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION pmax  VALUES LESS THAN MAXVALUE
);


SET FOREIGN_KEY_CHECKS = 1;