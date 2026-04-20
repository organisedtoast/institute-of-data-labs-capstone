const { execFileSync } = require("node:child_process");

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function branchExists(branchName) {
  try {
    runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

function getRef(refName) {
  return runGit(["rev-parse", refName]);
}

function getDiffNames(leftRef, rightRef) {
  const output = runGit(["diff", "--name-only", `${leftRef}..${rightRef}`]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const mainBranch = "main";
const frontendBranch = "frontend-branch";

if (!branchExists(mainBranch)) {
  fail(`Missing local branch: ${mainBranch}`);
}

if (!branchExists(frontendBranch)) {
  fail(`Missing local branch: ${frontendBranch}`);
}

const mainSha = getRef(mainBranch);
const frontendSha = getRef(frontendBranch);
const diffNames = getDiffNames(mainBranch, frontendBranch);

if (diffNames.length > 0) {
  console.error("frontend-branch is not in sync with main.");
  console.error(`main: ${mainSha}`);
  console.error(`frontend-branch: ${frontendSha}`);
  console.error("Changed paths:");
  diffNames.forEach((name) => {
    console.error(`- ${name}`);
  });
  process.exit(1);
}

console.log("frontend-branch matches main.");
console.log(`main: ${mainSha}`);
console.log(`frontend-branch: ${frontendSha}`);
