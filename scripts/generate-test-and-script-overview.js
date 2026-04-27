const fs = require("fs");
const path = require("path");

const { TEST_AND_SCRIPT_OVERVIEW_SOURCE } = require("./test-and-script-overview-source");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "test-and-script-overview.md");
const REGENERATE_COMMAND = "npm run docs:test-overview";

function validateOverviewSource(source) {
  if (!source?.title) {
    throw new Error("Test-and-script overview source is missing the top-level title.");
  }

  if (!Array.isArray(source?.sections) || source.sections.length === 0) {
    throw new Error("Test-and-script overview source must include at least one section.");
  }

  source.sections.forEach((section) => {
    const hasGroups = Array.isArray(section.groups) && section.groups.length > 0;
    const hasParagraphs = Array.isArray(section.paragraphs) && section.paragraphs.length > 0;

    if (!section.heading || (!hasGroups && !hasParagraphs)) {
      throw new Error(`Overview section "${section.heading || "unknown"}" is incomplete.`);
    }

    (section.groups || []).forEach((group) => {
      if (!group.heading || !Array.isArray(group.entries) || group.entries.length === 0) {
        throw new Error(`Overview group "${group.heading || "unknown"}" must include entries.`);
      }
    });
  });
}

function renderParagraph(text) {
  return text;
}

function renderEntry(entry) {
  return `${entry.name} ${entry.description}`;
}

function buildTestAndScriptOverviewMarkdown(source = TEST_AND_SCRIPT_OVERVIEW_SOURCE) {
  validateOverviewSource(source);

  const lines = [
    `# ${source.title}`,
    "",
    `> Generated from [\`${source.generatedFromPath}\`](../${source.generatedFromPath}). Edit the source module, not this markdown. Regenerate with \`${REGENERATE_COMMAND}\`.`,
    "",
    ...source.introParagraphs,
    "",
    "## How this doc stays updated",
    "",
    ...source.workflowNotes.map((note) => `- ${note}`),
    "",
  ];

  source.sections.forEach((section) => {
    lines.push(`## ${section.heading}`);
    lines.push("");

    (section.intro || []).forEach((paragraph) => {
      lines.push(renderParagraph(paragraph));
      lines.push("");
    });

    (section.groups || []).forEach((group) => {
      lines.push(`### ${group.heading}`);
      lines.push("");

      group.entries.forEach((entry) => {
        lines.push(renderEntry(entry));
        lines.push("");
      });

      (group.closingParagraphs || []).forEach((paragraph) => {
        lines.push(renderParagraph(paragraph));
        lines.push("");
      });
    });

    (section.paragraphs || []).forEach((paragraph) => {
      lines.push(renderParagraph(paragraph));
      lines.push("");
    });

    if (Array.isArray(section.bullets) && section.bullets.length > 0) {
      section.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
      lines.push("");
    }
  });

  return lines.join("\n");
}

function writeTestAndScriptOverviewMarkdown(outputPath = DEFAULT_OUTPUT_PATH) {
  const markdown = buildTestAndScriptOverviewMarkdown();
  fs.writeFileSync(outputPath, markdown);
  return markdown;
}

if (require.main === module) {
  // Beginners can run this file through `npm run docs:test-overview`.
  // The generator rewrites the whole markdown file every time so a follow-up
  // stale-output test can compare checked-in docs against deterministic output.
  writeTestAndScriptOverviewMarkdown();
}

module.exports = {
  TEST_AND_SCRIPT_OVERVIEW_SOURCE,
  buildTestAndScriptOverviewMarkdown,
  validateOverviewSource,
  writeTestAndScriptOverviewMarkdown,
};
