# SARS-CoV-2-Variation-Monitoring-Network
This platform analyzes GISAID whole-genome sequences to track SARS-CoV-2 variants by country or worldwide. Users can follow the spread of variants, mutations across viral genes such as the S gene, and time-lapse trends of specific mutation sites.

The interface is bilingual (English / Traditional Chinese) and has four modules:

| Module | Description |
|---|---|
| **Six Strain Types** | Daily proportion of the six major SARS-CoV-2 strain types, with a time-lapse world map |
| **Emerging Genomic Variation** | Daily frequency of variations by gene, filtered by latest allele frequency, with the top 15 variations per day |
| **VOC Tracking** | Daily frequency of variants of concern and their sublineages, top 10 sublineages per day, and cumulative sequence counts |
| **CSS Rankings** | Correlated SNV sets (CSS) ranked by strain count, linkage, S-gene mutations, persistence, growth and deletions, with smoothed prevalence curves |

## References

The analyses used in this monitoring network are described in:

1. Yang H-C, et al. **Analysis of genomic distributions of SARS-CoV-2 reveals a dominant strain type with strong allelic associations.** *Proceedings of the National Academy of Sciences* 117(48), 30679–30686 (2020). [doi:10.1073/pnas.2007840117](https://doi.org/10.1073/pnas.2007840117)
2. Yang H-C, et al. **Subtyping of major SARS-CoV-2 variants reveals different transmission dynamics based on 10 million genomes.** *PNAS Nexus* 1(4), pgac181 (2022). [doi:10.1093/pnasnexus/pgac181](https://doi.org/10.1093/pnasnexus/pgac181)

Sequence data are from [GISAID](https://gisaid.org/). Only aggregated results are stored in the database; no individual sequences are included in this repository.

## Requirements

### Server

| Software | Version | Notes |
|---|---|---|
| Linux | Ubuntu 24.04.3 LTS | Other distributions should also work |
| Apache HTTP Server | 2.4.58 (prefork MPM) | Modules: `mod_php`, `mod_headers`, `mod_alias` |
| PHP | 8.3.6 | Extensions: `pdo_mysql`, `mysqlnd` |
| MySQL | 8.0.46 | 8.0 or later required; MariaDB is **not** supported (requires `utf8mb4_0900_ai_ci` and window functions) |

Versions listed are those used on the production server.

```bash
sudo apt update
sudo apt install apache2 php libapache2-mod-php php-mysql mysql-server
sudo a2enmod headers
```

### Front-end libraries

Bootstrap is included in this repository. The other libraries are loaded from CDNs, so nothing else needs to be downloaded.

| Library | Version | Source |
|---|---|---|
| Bootstrap | 5.3.6 | Included (`Web/front-end/bootstrap-5.3.6-dist/`) |
| Chart.js | 4.x | jsDelivr |
| chartjs-adapter-date-fns | 3.x | jsDelivr |
| chartjs-plugin-datalabels | 2.x | jsDelivr |
| noUiSlider | 15.8.1 | jsDelivr |
| jsPDF | 2.5.1 | cdnjs |
| html2canvas | 1.4.1 | cdnjs |
| SheetJS (xlsx) | 0.18.5 | cdnjs |
