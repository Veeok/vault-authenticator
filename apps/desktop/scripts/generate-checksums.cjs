const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.resolve(projectRoot, process.argv[2] || "out/make");
const checksumFile = path.join(outputRoot, "CHECKSUMS.txt");
const artifactExtensions = new Set([".exe", ".zip", ".dmg", ".pkg", ".msi", ".nupkg", ".blockmap", ".appimage", ".deb", ".rpm"]);

function walkFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
      continue;
    }
    files.push(entryPath);
  }

  return files;
}

if (!fs.existsSync(outputRoot)) {
  console.error(`[checksums] Build output not found: ${outputRoot}`);
  process.exit(1);
}

const artifacts = walkFiles(outputRoot)
  .filter((filePath) => path.basename(filePath) !== "CHECKSUMS.txt")
  .filter((filePath) => artifactExtensions.has(path.extname(filePath).toLowerCase()))
  .sort((left, right) => left.localeCompare(right));

if (artifacts.length === 0) {
  console.error(`[checksums] No release artifacts found under ${outputRoot}`);
  process.exit(1);
}

const lines = artifacts.map((filePath) => {
  const hash = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  const relativePath = path.relative(outputRoot, filePath).replace(/\\/g, "/");
  return `${hash}  ${relativePath}`;
});

fs.writeFileSync(checksumFile, `${lines.join("\n")}\n`, "utf8");
console.log(`[checksums] Wrote ${artifacts.length} checksum(s) to ${checksumFile}`);
