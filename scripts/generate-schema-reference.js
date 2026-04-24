const fs = require("fs");
const path = require("path");

const {
  CATEGORY_NAMES,
  DEFAULT_LENSES,
  DISPLAY_FIELD_DEFINITIONS,
  ANNUAL_GROUP_FIELDS,
  ANNUAL_FIELD_SOURCE_META,
  FORECAST_BUCKET_FIELDS,
  FORECAST_FIELD_SOURCE_META,
  TOP_LEVEL_OVERRIDE_GROUP_FIELDS,
  TOP_LEVEL_FIELD_SOURCE_META,
  ROIC_ENDPOINTS,
} = require("../catalog/fieldCatalog");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "schema-reference.md");
const FORECAST_BUCKETS = ["fy1", "fy2", "fy3"];

// These rows are structural model fields rather than metric-catalog entries, so
// we document them explicitly here and keep the catalog-driven sections for the
// larger metric families below.
const TOP_LEVEL_REFERENCE_FIELDS = [
  { fieldPath: "tickerSymbol", label: "Ticker symbol", sourceType: "system", roicEndpoint: null },
  { fieldPath: "companyName", label: "Company name override object", sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.COMPANY_PROFILE },
  { fieldPath: "investmentCategory", label: "User-facing investment category", sourceType: "system", roicEndpoint: null },
  { fieldPath: "priceCurrency", label: "Price currency", sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.COMPANY_PROFILE },
  { fieldPath: "reportingCurrency", label: "Reporting currency", sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  { fieldPath: "sourceMeta.lastImportedAt", label: "Last import timestamp", sourceType: "system", roicEndpoint: null },
  { fieldPath: "sourceMeta.lastRefreshAt", label: "Last refresh timestamp", sourceType: "system", roicEndpoint: null },
  { fieldPath: "sourceMeta.importRangeYears", label: "Requested yearly import range", sourceType: "system", roicEndpoint: null },
  { fieldPath: "sourceMeta.roicEndpointsUsed", label: "ROIC endpoints used by import", sourceType: "system", roicEndpoint: "Multiple endpoints" },
  { fieldPath: "annualData[]", label: "Historical annual rows", sourceType: "system", roicEndpoint: "Multiple endpoints" },
  { fieldPath: "forecastData", label: "Forecast buckets container", sourceType: "system", roicEndpoint: null },
  { fieldPath: "growthForecasts", label: "Manual growth forecast metrics", sourceType: "system", roicEndpoint: null },
  { fieldPath: "analystRevisions", label: "Manual analyst revision metrics", sourceType: "system", roicEndpoint: null },
];

const ANNUAL_CORE_FIELDS = [
  { fieldPath: "annualData[].fiscalYear", label: "Fiscal year", sourceType: "roic", roicEndpoint: "Multiple annual endpoints" },
  { fieldPath: "annualData[].fiscalYearEndDate", label: "FY end date", sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.PER_SHARE },
  { fieldPath: "annualData[].reportingCurrency", label: "Annual reporting currency", sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  { fieldPath: "annualData[].earningsReleaseDate", label: "FY release date", sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.EARNINGS_CALLS },
];

function formatEndpoint(roicEndpoint) {
  return roicEndpoint || "N/A";
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function buildVisibilityMap() {
  const visibilityMap = new Map();

  for (const row of DISPLAY_FIELD_DEFINITIONS) {
    const categories = visibilityMap.get(row.fieldPath) || new Set();

    row.categories.forEach((category) => categories.add(category));
    visibilityMap.set(row.fieldPath, categories);
  }

  return visibilityMap;
}

function formatCategories(categories) {
  if (!categories || categories.length === 0) {
    return "N/A";
  }

  if (categories.length === CATEGORY_NAMES.length) {
    return `All (${CATEGORY_NAMES.length})`;
  }

  if (categories.length <= 3) {
    return `${categories.join(", ")} (${categories.length})`;
  }

  const preview = categories.slice(0, 3).join(", ");
  return `${preview} +${categories.length - 3} more`;
}

function getVisibilitySummary(fieldPath, visibilityMap, fallbackCategories = CATEGORY_NAMES) {
  const categories = visibilityMap.has(fieldPath)
    ? [...visibilityMap.get(fieldPath)]
    : fallbackCategories;

  return formatCategories(categories);
}

function getPrimaryLabel(fieldPath, fallbackLabel) {
  const match = DISPLAY_FIELD_DEFINITIONS.find((row) => row.fieldPath === fieldPath);

  if (match?.label) {
    return match.label;
  }

  return String(fallbackLabel)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bfy(\d)\b/gi, "FY+$1")
    .replace(/^./, (character) => character.toUpperCase());
}

function buildMetricRow(fieldPath, label, sourceType, roicEndpoint, visibilityMap, fallbackCategories) {
  return {
    fieldPath,
    label,
    sourceType,
    roicEndpoint: formatEndpoint(roicEndpoint),
    categories: getVisibilitySummary(fieldPath, visibilityMap, fallbackCategories),
  };
}

function renderTable(rows) {
  const lines = [
    "| Field path | Label | Source type | ROIC endpoint | Visible in categories |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.fieldPath)} | ${escapeCell(row.label)} | ${escapeCell(row.sourceType)} | ${escapeCell(row.roicEndpoint)} | ${escapeCell(row.categories)} |`
    );
  }

  return lines.join("\n");
}

function buildTopLevelRows(visibilityMap) {
  return TOP_LEVEL_REFERENCE_FIELDS.map((field) =>
    buildMetricRow(
      field.fieldPath,
      field.label,
      field.sourceType,
      field.roicEndpoint,
      visibilityMap
    )
  );
}

function buildAnnualCoreRows(visibilityMap) {
  return ANNUAL_CORE_FIELDS.map((field) =>
    buildMetricRow(
      field.fieldPath,
      field.label,
      field.sourceType,
      field.roicEndpoint,
      visibilityMap
    )
  );
}

function buildAnnualGroupSections(visibilityMap) {
  return Object.entries(ANNUAL_GROUP_FIELDS).map(([groupName, fieldNames]) => {
    const rows = fieldNames.map((fieldName) => {
      const relativePath = `${groupName}.${fieldName}`;
      const fieldPath = `annualData[].${relativePath}`;
      const sourceMeta = ANNUAL_FIELD_SOURCE_META[relativePath];

      return buildMetricRow(
        fieldPath,
        getPrimaryLabel(fieldPath, fieldName),
        sourceMeta?.sourceType || "system",
        sourceMeta?.roicEndpoint || null,
        visibilityMap
      );
    });

    return {
      title: `annualData[].${groupName}`,
      rows,
    };
  });
}

function buildForecastRows(visibilityMap) {
  return FORECAST_BUCKETS.flatMap((bucket) =>
    FORECAST_BUCKET_FIELDS.map((fieldName) => {
      const fieldPath = `forecastData.${bucket}.${fieldName}`;
      const sourceMeta = FORECAST_FIELD_SOURCE_META[fieldName];

      return buildMetricRow(
        fieldPath,
        getPrimaryLabel(fieldPath, `${fieldName} ${bucket.toUpperCase()}`),
        sourceMeta?.sourceType || "system",
        sourceMeta?.roicEndpoint || null,
        visibilityMap
      );
    })
  );
}

function buildTopLevelMetricSections(visibilityMap) {
  return Object.entries(TOP_LEVEL_OVERRIDE_GROUP_FIELDS).map(([groupName, fieldNames]) => ({
    title: groupName,
    rows: fieldNames.map((fieldName) => {
      const fieldPath = `${groupName}.${fieldName}`;
      const sourceMeta = TOP_LEVEL_FIELD_SOURCE_META[fieldPath];

      return buildMetricRow(
        fieldPath,
        getPrimaryLabel(fieldPath, fieldName),
        sourceMeta?.sourceType || "system",
        sourceMeta?.roicEndpoint || null,
        visibilityMap
      );
    }),
  }));
}

function buildLensSummaryRows() {
  return DEFAULT_LENSES.map((lens) => {
    const cardCount = lens.fieldConfigs.filter((field) => field.surface === "card").length;
    const detailCount = lens.fieldConfigs.filter((field) => field.surface === "detail").length;
    const samples = [...new Set(lens.fieldConfigs.map((field) => field.fieldPath))]
      .slice(0, 3)
      .join(", ");

    return {
      name: lens.name,
      cardCount,
      detailCount,
      samplePaths: samples || "N/A",
    };
  });
}

function validateSections(sections) {
  for (const section of sections) {
    if (!section.rows || section.rows.length === 0) {
      throw new Error(`Schema reference section "${section.title}" rendered no rows.`);
    }
  }
}

function buildSchemaReferenceMarkdown() {
  const visibilityMap = buildVisibilityMap();
  const annualGroupSections = buildAnnualGroupSections(visibilityMap);
  const topLevelMetricSections = buildTopLevelMetricSections(visibilityMap);
  const requiredSections = [
    { title: "Top-level stock fields", rows: buildTopLevelRows(visibilityMap) },
    { title: "annualData[] core row fields", rows: buildAnnualCoreRows(visibilityMap) },
    ...annualGroupSections,
    { title: "forecastData.fy1|fy2|fy3", rows: buildForecastRows(visibilityMap) },
    ...topLevelMetricSections,
  ];

  validateSections(requiredSections);

  const lensSummary = buildLensSummaryRows();
  const markdown = [
    "# Schema Reference",
    "",
    "> Generated from [`catalog/fieldCatalog.js`](../catalog/fieldCatalog.js). Edit the catalog, not this markdown. Regenerate with `npm run docs:schema`.",
    "",
    "## How To Read This Model",
    "",
    "- Most numeric and text metrics use the same override object shape: `roicValue`, `userValue`, `effectiveValue`, `sourceOfTruth`, and `lastOverriddenAt`.",
    "- `roic` means the default value comes directly from a mapped ROIC endpoint.",
    "- `derived` means the backend calculates the value from other effective inputs.",
    "- `system` means the field is structural or a backend-managed default rather than a metric imported from ROIC.",
    "- `manualOnly` means the schema reserves the field now, but users supply the value rather than ROIC.",
    "- Lens display rows can intentionally reuse the same stored field path with different labels or sections, so this document shows canonical storage paths instead of every UI variation.",
    "",
    "## Top-level stock fields",
    "",
    renderTable(requiredSections[0].rows),
    "",
    "## annualData[] core row fields",
    "",
    renderTable(requiredSections[1].rows),
    "",
  ];

  for (const section of annualGroupSections) {
    markdown.push(`## ${section.title}`, "", renderTable(section.rows), "");
  }

  markdown.push(
    "## forecastData.fy1|fy2|fy3",
    "",
    renderTable(requiredSections[requiredSections.findIndex((section) => section.title === "forecastData.fy1|fy2|fy3")].rows),
    ""
  );

  for (const section of topLevelMetricSections) {
    markdown.push(`## ${section.title}`, "", renderTable(section.rows), "");
  }

  markdown.push(
    "## Lens Summary",
    "",
    "This appendix stays compact on purpose. It tells a developer how broad each category is without dumping the full lens payload that already exists in the catalog and seed logic.",
    "",
    "| Investment category | Card fields | Detail fields | Sample field paths |",
    "| --- | --- | --- | --- |"
  );

  for (const row of lensSummary) {
    markdown.push(
      `| ${escapeCell(row.name)} | ${row.cardCount} | ${row.detailCount} | ${escapeCell(row.samplePaths)} |`
    );
  }

  markdown.push("");

  return markdown.join("\n");
}

function writeSchemaReference(outputPath = DEFAULT_OUTPUT_PATH) {
  const markdown = buildSchemaReferenceMarkdown();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, "utf8");

  return outputPath;
}

if (require.main === module) {
  try {
    const outputPath = writeSchemaReference();
    console.log(`Schema reference written to ${outputPath}`);
  } catch (error) {
    console.error(`Schema reference generation failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildSchemaReferenceMarkdown,
  validateSections,
  writeSchemaReference,
};
