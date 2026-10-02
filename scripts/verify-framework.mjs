import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "README.md",
  "VERSION.txt",
  "index.html",
  "core/config/site.json",
  "core/css/framework.css",
  "core/css/tokens.css",
  "core/css/base.css",
  "core/css/layout.css",
  "core/css/components.css",
  "core/js/ec-framework.js",
  "core/js/app.js",
  "core/js/forms.js",
  "core/js/theme-manager.js",
  "templates/page.html",
  "templates/service-page.html",
  "templates/contact-page.html",
  "templates/admin/index.html",
  "templates/admin/login.html",
  "templates/admin/login.js",
  "modules/admin/storage.js",
  "modules/admin/repository.js",
  "modules/content/collection.js",
  "integrations/supabase/supabase-config.example.js",
  "docs/NEW-PROJECT-GUIDE.md",
  "docs/SECURITY-STANDARD.md",
  "docs/LAUNCH-CHECKLIST.md",
];

const findings = [];
for (const relative of required) {
  const absolute = path.join(root, relative);
  try {
    const info = await stat(absolute);
    if (!info.isFile() || info.size === 0) findings.push(`${relative}: missing or empty`);
  } catch {
    findings.push(`${relative}: missing or empty`);
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

const textExtensions = new Set([".html", ".css", ".js", ".mjs", ".json", ".md", ".sql", ".txt", ".example"]);
const secretPatterns = [
  { name: "JWT-like credential", pattern: /eyJ[a-zA-Z0-9_-]{25,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/ },
  { name: "live Supabase hostname", pattern: /https:\/\/[a-z0-9]{15,}\.supabase\.co/i },
  { name: "Supabase secret key", pattern: /sb_secret_[a-zA-Z0-9_-]{20,}/ },
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

for (const file of await walk(root)) {
  if (!textExtensions.has(path.extname(file)) && !path.basename(file).startsWith(".env")) continue;
  const content = await readFile(file, "utf8");
  for (const check of secretPatterns) {
    // Only this validated public configuration may contain a live project hostname.
    if(check.name === "live Supabase hostname" && path.relative(root,file) === "data/community-auth.json")continue;
    if (check.pattern.test(content)) findings.push(`${path.relative(root, file)}: possible ${check.name}`);
  }

  if (path.extname(file) === ".js" || path.extname(file) === ".mjs") {
    for (const match of content.matchAll(/(?:import|export)\s+(?:[^"']+?\s+from\s+)?["'](\.[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(file), match[1].split(/[?#]/)[0]);
      try { await stat(target); } catch { findings.push(`${path.relative(root, file)}: unresolved import ${match[1]}`); }
    }
  }

  if (path.extname(file) === ".html") {
    for (const match of content.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      const reference = match[1];
      if (/^(?:https?:|data:|mailto:|tel:|#)/.test(reference)) continue;
      const target = path.resolve(path.dirname(file), reference.split(/[?#]/)[0]);
      try { await stat(target); } catch { findings.push(`${path.relative(root, file)}: missing asset ${reference}`); }
    }
  }
}

const authConfig=JSON.parse(await readFile(path.join(root,"data/community-auth.json"),"utf8"));
if(Object.keys(authConfig).sort().join(',')!=='projectUrl,publishableKey' || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(authConfig.projectUrl) || !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(authConfig.publishableKey))findings.push('Invalid public community auth configuration.');
JSON.parse(await readFile(path.join(root, "core/config/site.json"), "utf8"));
JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

if (findings.length) {
  findings.forEach((finding) => console.error(`FAIL ${finding}`));
  process.exit(1);
}

console.log(`EC Framework ${JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version} verification passed.`);
