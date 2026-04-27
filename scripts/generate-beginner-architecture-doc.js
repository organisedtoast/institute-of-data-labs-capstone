const fs = require("fs");
const path = require("path");

const { ARCHITECTURE_DOC_SOURCE } = require("./architecture-doc-source");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "beginner-architecture-diagram.md");
const REGENERATE_COMMAND = "npm run docs:architecture";

function formatNode(node) {
  const label = node.label;

  if (node.shape === "database") {
    return `${node.id}[(${label})]`;
  }

  if (node.type === "start") {
    return `${node.id}([${label}])`;
  }

  if (node.type === "decision") {
    return `${node.id}{${label}}`;
  }

  return `${node.id}[${label}]`;
}

function renderMermaidDiagram(diagram) {
  const lines = [`flowchart ${diagram.direction}`];

  (diagram.standaloneNodes || []).forEach((node) => {
    lines.push(`    ${formatNode(node)}`);
  });

  (diagram.groups || []).forEach((group) => {
    lines.push("");
    lines.push(`    subgraph ${group.id}[${group.label}]`);
    group.nodes.forEach((node) => {
      lines.push(`        ${formatNode(node)}`);
    });
    lines.push("    end");
  });

  lines.push("");

  (diagram.edges || []).forEach((edge) => {
    const edgeLabel = edge.label ? `|${edge.label}| ` : "";
    lines.push(`    ${edge.from} -->${edgeLabel}${edge.to}`);
  });

  return ["```mermaid", ...lines, "```"].join("\n");
}

function renderBulletList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderFileLink(file) {
  const label = file.path;
  const target = file.path.startsWith("../") ? file.path : `../${file.path}`;

  if (file.description) {
    return `- [\`${label}\`](${target}) - ${file.description}`;
  }

  return `- [\`${label}\`](${target})`;
}

function renderFileList(files) {
  return files.map(renderFileLink).join("\n");
}

function renderFileMapSection(section) {
  const lines = [`### ${section.title}`, ""];

  if (section.intro && section.intro.length > 0) {
    section.intro.forEach((line) => lines.push(line));
    lines.push("");
  }

  if (section.keyFiles && section.keyFiles.length > 0) {
    lines.push(renderFileList(section.keyFiles));
    lines.push("");
  }

  if (section.supportingFiles && section.supportingFiles.length > 0) {
    lines.push("Supporting files:");
    lines.push("");
    lines.push(renderFileList(section.supportingFiles));
    lines.push("");
  }

  (section.blocks || []).forEach((block) => {
    lines.push(`#### ${block.title}`);
    lines.push("");
    lines.push("Key files:");
    lines.push("");
    lines.push(renderFileList(block.keyFiles));
    lines.push("");

    if (block.supportingFiles && block.supportingFiles.length > 0) {
      lines.push("Supporting files:");
      lines.push("");
      lines.push(renderFileList(block.supportingFiles));
      lines.push("");
    }
  });

  return lines.join("\n").trimEnd();
}

function validateArchitectureDocSource(source) {
  if (!source?.title) {
    throw new Error("Architecture doc source is missing the top-level title.");
  }

  const fileMapSections = source?.sections?.fileMapSections || [];
  if (fileMapSections.length === 0) {
    throw new Error("Architecture doc source must include at least one file-map section.");
  }

  if ((source?.sections?.beginnerNotes || []).length === 0) {
    throw new Error("Architecture doc source must include beginner notes.");
  }

  fileMapSections.forEach((section) => {
    const hasSectionFiles = (section.keyFiles && section.keyFiles.length > 0)
      || (section.blocks && section.blocks.length > 0);

    if (!section.title || !hasSectionFiles) {
      throw new Error(`Architecture file-map section "${section.title || "unknown"}" is incomplete.`);
    }

    (section.blocks || []).forEach((block) => {
      if (!block.title || !Array.isArray(block.keyFiles) || block.keyFiles.length === 0) {
        throw new Error(`Architecture block "${block.title || "unknown"}" must include key files.`);
      }
    });
  });
}

function buildBeginnerArchitectureMarkdown(source = ARCHITECTURE_DOC_SOURCE) {
  validateArchitectureDocSource(source);

  const lines = [
    `# ${source.title}`,
    "",
    `> Generated from [\`${source.generatedFromPath}\`](../${source.generatedFromPath}). Edit the source module, not this markdown. Regenerate with \`${REGENERATE_COMMAND}\`.`,
    "",
    ...source.introParagraphs,
    "",
    "## High-Level Diagram",
    "",
    renderMermaidDiagram(source.sections.highLevelDiagram),
    "",
    "## Legend",
    "",
    renderBulletList(source.sections.legend),
    "",
    "## Beginner Notes",
    "",
    renderBulletList(source.sections.beginnerNotes),
    "",
    "## How To Read It",
    "",
    renderBulletList(source.sections.howToRead),
    "",
    "## User Flow Diagram",
    "",
    ...source.sections.userFlowIntro,
    "",
    renderMermaidDiagram(source.sections.userFlowDiagram),
    "",
    "## User Flow Notes",
    "",
    renderBulletList(source.sections.userFlowNotes),
    "",
    "## Key And Supporting Files By Architecture Block",
    "",
    ...source.sections.fileMapIntro,
    "",
    ...source.sections.fileMapSections.map((section) => `${renderFileMapSection(section)}\n`),
    "## Workflow Notes",
    "",
    renderBulletList(source.workflowNotes),
    "",
  ];

  return lines.join("\n");
}

function writeBeginnerArchitectureMarkdown(outputPath = DEFAULT_OUTPUT_PATH) {
  const markdown = buildBeginnerArchitectureMarkdown();
  fs.writeFileSync(outputPath, markdown);
  return markdown;
}

if (require.main === module) {
  // Beginners can run this file through `npm run docs:architecture`.
  // The script writes the whole markdown file every time so CI can compare the
  // checked-in doc to deterministic generated output.
  writeBeginnerArchitectureMarkdown();
}

module.exports = {
  ARCHITECTURE_DOC_SOURCE,
  buildBeginnerArchitectureMarkdown,
  renderMermaidDiagram,
  validateArchitectureDocSource,
  writeBeginnerArchitectureMarkdown,
};
