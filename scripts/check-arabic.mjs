#!/usr/bin/env node
/**
 * Admin's UI is English only. This fails if Arabic script appears anywhere in
 * src/ outside the files below, which hold data rather than interface text.
 *
 *   npm run check:arabic
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json']);
const ARABIC = /\p{Script=Arabic}/u;

const ALLOWED = {
  'src/lib/printContract.ts': 'Printed rental contract, trilingual for the customer to sign',
  'src/lib/printReplacementSheet.ts': 'Printed replacement sheet, trilingual for the customer to sign',
  'src/lib/hgsStatementText.ts': 'HGS toll statement PDF, printed in the customer\'s language',
  'src/lib/customerInsights.test.ts': 'Test input: a customer name, which is data',
  'src/lib/staffAccess.test.ts': 'Test input: an Arabic label that must not match a department',
  'src/pages/marketing/MarketingApprovalsPage.tsx': 'Sample marketing copy written for Arabic audiences',
  'src/pages/marketing/MarketingBlogPostsPage.tsx': 'Sample Arabic articles, plus a regex that strips Arabic from slugs',
  'src/pages/marketing/MarketingCampaignsPage.tsx': 'Sample Arabic ad copy',
  'src/pages/marketing/MarketingCompetitorsPage.tsx': 'Competitor names and captions as they appear in Arabic',
  'src/pages/marketing/MarketingPerformancePage.tsx': 'Sample Arabic post title',
};

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return walk(path);
    return EXTENSIONS.has(extname(name)) ? [path] : [];
  });
}

const hits = [];
const allowed = [];

for (const path of walk(SRC)) {
  const file = relative(ROOT, path).split('\\').join('/');
  const lines = readFileSync(path, 'utf8').split('\n');
  const matches = lines.flatMap((text, index) => (ARABIC.test(text) ? [{ line: index + 1, text: text.trim() }] : []));
  if (matches.length === 0) continue;
  if (ALLOWED[file]) allowed.push({ file, count: matches.length, reason: ALLOWED[file] });
  else hits.push(...matches.map((match) => ({ file, ...match })));
}

for (const { file, count, reason } of allowed) console.log(`allowed  ${String(count).padStart(3)}  ${file}  (${reason})`);
for (const { file, line, text } of hits) console.error(`ARABIC   ${file}:${line}  ${text.slice(0, 90)}`);

console.log(`\n${hits.length} Arabic UI line(s), ${allowed.reduce((sum, row) => sum + row.count, 0)} allowed line(s) in ${allowed.length} data file(s).`);
process.exit(hits.length > 0 ? 1 : 0);
