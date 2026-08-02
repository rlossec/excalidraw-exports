#!/usr/bin/env node
/**
 * Convertit des fichiers Excalidraw au format presse-papiers
 * (`type: "excalidraw/clipboard"`) en fichiers `.excalidraw`.
 *
 * Usage:
 *   node script/clipboard-to-excalidraw.mjs
 *   node script/clipboard-to-excalidraw.mjs database projects
 *   node script/clipboard-to-excalidraw.mjs path/to/file.json
 *   node script/clipboard-to-excalidraw.mjs --keep path/to/dir
 *
 * Options:
 *   --keep   Conserve les fichiers .json d'origine (supprimés par défaut)
 *   --dry    Affiche ce qui serait fait sans écrire ni supprimer
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_TARGETS = ["database", "projects"];

function parseArgs(argv) {
  const flags = new Set();
  const targets = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg.slice(2));
    else targets.push(arg);
  }

  return {
    keep: flags.has("keep"),
    dry: flags.has("dry"),
    targets: targets.length > 0 ? targets : DEFAULT_TARGETS,
  };
}

function collectJsonFiles(target) {
  const absolute = path.isAbsolute(target)
    ? target
    : path.resolve(ROOT, target);

  if (!fs.existsSync(absolute)) {
    console.warn(`Ignoré (introuvable): ${absolute}`);
    return [];
  }

  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    return absolute.toLowerCase().endsWith(".json") ? [absolute] : [];
  }

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith(".json")) files.push(full);
    }
  };
  walk(absolute);
  return files;
}

function convertFile(file, { keep, dry }) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));

  if (data.type !== "excalidraw/clipboard") {
    return {
      file,
      status: "skipped",
      reason: `type=${data.type ?? "undefined"}`,
    };
  }

  const out = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: data.elements ?? [],
    appState: {
      gridSize: null,
      viewBackgroundColor: "#ffffff",
    },
    files: data.files ?? {},
  };

  const outPath = file.replace(/\.json$/i, ".excalidraw");

  if (dry) {
    return {
      file,
      outPath,
      status: "dry-run",
      elements: out.elements.length,
      wouldDelete: !keep,
    };
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  if (!keep) fs.unlinkSync(file);

  return {
    file,
    outPath,
    status: "converted",
    elements: out.elements.length,
    deletedSource: !keep,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = options.targets.flatMap(collectJsonFiles);

  if (files.length === 0) {
    console.log("Aucun fichier .json trouvé (rien à convertir).");
    return;
  }

  const results = files.map((file) => convertFile(file, options));

  const converted = results.filter((r) => r.status === "converted").length;
  const dryRun = results.filter((r) => r.status === "dry-run").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  for (const result of results) {
    if (result.status === "skipped") {
      console.log(`⊘ ${path.relative(ROOT, result.file)} (${result.reason})`);
    } else if (result.status === "dry-run") {
      console.log(
        `· ${path.relative(ROOT, result.file)} → ${path.relative(ROOT, result.outPath)} (${result.elements} éléments)`,
      );
    } else {
      const note = result.deletedSource ? "" : " [json conservé]";
      console.log(
        `✓ ${path.relative(ROOT, result.outPath)} (${result.elements} éléments)${note}`,
      );
    }
  }

  console.log(
    `\nRésumé: ${converted || dryRun} traité(s), ${skipped} ignoré(s)${options.dry ? " (dry-run)" : ""}`,
  );
}

main();
