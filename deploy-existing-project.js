const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const token = process.env.VERCEL_TOKEN;
const preferredProjectName = process.env.VERCEL_PROJECT_NAME || "astro-course";

if (!token) {
  console.error("Missing VERCEL_TOKEN. Set it in this PowerShell session first.");
  process.exit(1);
}

const ignored = new Set([
  "deploy-existing-project.js",
  "preview-server.js",
  "local-shared-state.json"
]);

function walk(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) files.push(...walk(full, rel));
    else files.push(rel);
  }
  return files;
}

async function api(pathname, options = {}) {
  const res = await fetch(`https://api.vercel.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${res.status} ${JSON.stringify(body).slice(0, 1000)}`);
  }
  return body;
}

async function findProject() {
  const data = await api(`/v9/projects?search=${encodeURIComponent(preferredProjectName)}`);
  const projects = data.projects || [];
  const exact = projects.find(project => project.name === preferredProjectName);
  const project = exact || projects[0];
  if (!project) {
    throw new Error(`No Vercel project found for "${preferredProjectName}". Set VERCEL_PROJECT_NAME to the exact project name.`);
  }
  return project;
}

function filePayload(relPath) {
  const full = path.join(root, relPath);
  const data = fs.readFileSync(full);
  const ext = path.extname(relPath).toLowerCase();
  const textLike = [".js", ".json", ".html", ".css", ".md", ".txt", ".yml", ".yaml", ".webmanifest"].includes(ext);
  return {
    file: relPath,
    data: textLike ? data.toString("utf8") : data.toString("base64"),
    encoding: textLike ? "utf-8" : "base64",
    sha: crypto.createHash("sha1").update(data).digest("hex"),
    size: data.length
  };
}

async function main() {
  const project = await findProject();
  console.log(`Deploying to existing Vercel project: ${project.name} (${project.id})`);

  const files = walk(root).map(filePayload);
  console.log(`Uploading ${files.length} files...`);

  const deployment = await api("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: project.name,
      project: project.id,
      target: "production",
      files,
      projectSettings: {
        framework: null,
        buildCommand: null,
        outputDirectory: "public",
        installCommand: null
      }
    })
  });

  console.log(`Deployment created: ${deployment.url}`);
  console.log(`Production target requested. Open: https://${deployment.url}/?mode=share`);
  console.log(`Check shared API: https://${deployment.url}/api/state`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
