# AGENTS.md

## Project Overview

This repository contains a Chrome Extension and a static documentation/blog site for Mubu Exporter.

- Extension source: `src/`, `manifest.json`, `_locales/`, `icons/`, `asserts/`
- Extension build output: `dist/`
- Static website and blog: `docs/`
- Blog shared assets: `docs/blog/blog-common.css`, `docs/blog/blog-common.js`, `docs/blog/blog-components.js`
- Blog images: `docs/images/`
- SEO/GEO support files: `docs/sitemap.xml`, `docs/llms.txt`, `docs/robots.txt`

The product is a local-first Chrome extension for batch exporting Mubu notes to Markdown, OPML, FreeMind, HTML, Word, PDF, and JSON.

## Common Commands

Install dependencies:

```bash
npm install
```

Build the Chrome extension:

```bash
npm run build
```

Package the extension:

```bash
npm run pack
```

Watch build during extension development:

```bash
npm run build:watch
```

There is no real test suite configured. `npm test` is a placeholder and exits with an error.

For static docs/blog work, opening files under `docs/` is usually enough. If a local server is useful:

```bash
python3 -m http.server 8000 -d docs
```

## Editing Rules

- Prefer editing source files under `src/`, `manifest.json`, `_locales/`, `docs/`, and shared blog components.
- Treat `dist/` as build output. Do not hand-edit `dist/` unless the user explicitly asks.
- Do not overwrite existing image assets unless explicitly asked. Create descriptive sibling filenames instead.
- Preserve existing user changes in the working tree. Do not use destructive git commands such as `git reset --hard` or `git checkout --`.
- Use `rg` / `rg --files` for search.

## Blog And SEO/GEO Rules

Prefer improving or rewriting an existing relevant URL when it already targets the same intent. Create a new URL only when the search intent is clearly different and the new page will not cannibalize an existing keyword.

When creating or rewriting a blog post, update all relevant surfaces:

- The article HTML file in `docs/blog/`
- `docs/blog/index.html` for homepage cards and Blog JSON-LD
- `docs/blog/blog-components.js` for titles and related posts
- `docs/sitemap.xml` with the article URL and current `lastmod`
- `docs/llms.txt` when the article is strategically important for AI citation/GEO
- `docs/blog/cluster-mubu-export/cluster-plan.json` when the keyword cluster status changes

Recommended workflow for new practical tutorials:

- Read nearby articles first and match the existing HTML structure, article voice, metadata style, and component conventions.
- Identify the primary keyword, secondary keywords, target intent, and internal-link targets before writing.
- For platform-specific migration articles, verify current platform behavior from primary/official docs when possible.
- Put the direct answer in the first screen: describe the recommended route in one concise paragraph and one quick-answer block.
- Separate migration from cleanup. Explain the safest order: export first, import second, validate third, then reorganize.
- Add concrete acceptance checks: page count, folder structure, heading/list levels, notes, images, links, permissions, and searchability.
- Include FAQ only when the page answers real search questions, not filler.
- Preserve dates consistently across article metadata, visible article date, homepage cards, JSON-LD, sitemap, and llms updates.

Each important blog post should include:

- Clear SEO title and meta description
- Canonical URL
- Open Graph and Twitter image metadata
- `BlogPosting` JSON-LD
- `BreadcrumbList` JSON-LD
- `HowTo` JSON-LD for practical tutorials when appropriate
- `FAQPage` JSON-LD when the page contains real FAQ content
- A direct quick-answer block near the top
- Practical steps, validation/checklist sections, and internal links
- A body illustration after the quick-answer block when the article has a dedicated blog image
- Related-post links near the end that support the same cluster and user journey

Content requirements for migration tutorials:

- Use a practical, realistic tone. The article should help the reader complete the migration, not just promote the extension.
- State a recommended route and explain when an alternative route is better.
- Mention fallback backups, especially JSON for original Mubu structure and Markdown for portable content.
- Explain what will not migrate automatically: comments, permissions, history, app-specific views, database properties, external image availability, and collaboration state.
- Use tables for format mapping, import-route choices, validation checklists, and permission handoff when they make scanning easier.
- Avoid claiming that target apps preserve every Mubu feature. Prefer "validate", "check", "fallback", "manual handoff", and "import route" language.

Avoid unverifiable or exaggerated claims such as:

- "100%"
- "无损"
- "自动生成双链"
- "自动下载图片"
- "格式保留率"
- Unsupported time/count claims unless they are already sourced in the project

For migration tutorials, be explicit about limitations: permissions, comments, history, external images, and platform-specific import behavior often need manual validation.

## Blog Image Rules

- Preferred blog card/header image size: `1344x768`.
- Preferred format: WebP.
- Store final blog images in `docs/images/`.
- Use descriptive filenames, for example `blog-mubu-to-obsidian-migration.webp`.
- Add descriptive `alt` text for body images and cards.
- If generating images with AI, save the final asset into `docs/images/`; do not leave project-referenced assets only in a generated-images cache.

Illustration style for new blog images:

- Use a Google Material-style product illustration language: clean flat vector artwork, generous white space, friendly geometric people, simplified UI cards, and a calm product-education mood.
- The image should feel like a help-center/onboarding illustration for a useful web product: clear, approachable, lightly playful, but still practical and instructional.
- Use a bright neutral background, preferably white, soft gray, or warm off-white. Avoid dark hero-art backgrounds and heavy atmospheric effects.
- Use Google-like primary color accents: blue as the main action color, green for completed/success states, yellow/orange for attention or ownership, and red only for errors. Keep the palette balanced with neutral grays and avoid one-hue blue/purple domination.
- Prefer flat fills, simple geometry, rounded rectangles, subtle paper-like shadows, and light layering. Avoid glossy 3D, glassmorphism, heavy gradients, skeuomorphism, and complex textures.
- Human figures, if used, should have simple rounded shapes, minimal facial detail, natural task-focused poses, and inclusive everyday styling. They should interact with the workflow by pointing, dragging, checking, or organizing content.
- Build the scene around a practical workflow, not a decorative dashboard: source documents, folders, export/import arrows, target workspace, validation checklist, and success states should be visually clear.
- Prefer a readable left-to-right or center-out process composition: source content -> export/transform/import action -> target knowledge base or workspace -> validation/checklist.
- UI panels should be abstracted product metaphors, not screenshots. Use simplified file cards, folder trees, tables, graph nodes, permissions chips, progress bars, and checklists only when they support the article topic.
- Keep the image practical and article-specific: Obsidian images should show vaults/graph links/MOC concepts; Notion images should show Markdown/ZIP/database organization; Feishu images should show team docs/permissions/validation.
- Do not copy Google logos, Google product marks, existing Google illustrations, or real third-party brand logos. The goal is Google-like illustration style, not Google-branded artwork.
- Avoid screenshots, photorealistic UI, mascot-heavy scenes, decorative-only abstract art, neon effects, dense dashboards, tiny unreadable labels, and cluttered backgrounds.
- Avoid Chinese text inside generated images. If text is necessary, use one short English phrase such as `OBSIDIAN`, `ZIP IMPORT`, or `TEAM DOCS`; ensure it is large and readable.
- Do not reuse unrelated text from another article image, such as `RETRY`, unless the article is specifically about retry/resume behavior.
- Keep key subjects inside safe margins so the image works in homepage card crops and article body width.

When adding a new blog image:

- Add the image to the article body after the quick-answer block.
- Update `og:image`, `twitter:image`, and `BlogPosting.image` to the same asset.
- Update the homepage card image in `docs/blog/index.html`.
- Keep old image files unless the user explicitly requests cleanup.
- After conversion, verify the final file is exactly `1344x768` and exists at the referenced path.

## Validation Checklist

For docs/blog changes:

```bash
node - <<'NODE'
const fs = require('fs');
const files = [
  'docs/blog/index.html'
];
for (const file of fs.readdirSync('docs/blog')) {
  if (file.endsWith('.html')) files.push(`docs/blog/${file}`);
}
let ok = true;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [i, match] of scripts.entries()) {
    try { JSON.parse(match[1]); }
    catch (err) {
      ok = false;
      console.error(`${file} JSON-LD block ${i + 1}: ${err.message}`);
    }
  }
}
process.exit(ok ? 0 : 1);
NODE
```

Validate sitemap:

```bash
xmllint --noout docs/sitemap.xml
```

Check whitespace/errors in diffs:

```bash
git diff --check
```

For extension code changes:

```bash
npm run build
```

Manual extension QA usually requires Chrome, loading the unpacked `dist/` directory, and an active Mubu login in the same browser profile.

## Current Site Notes

- `docs/robots.txt` points crawlers to `https://mubu.toolab.top/sitemap.xml`.
- `docs/llms.txt` is used for AI citation policy and high-value page discovery.
- The blog cluster plan lives at `docs/blog/cluster-mubu-export/cluster-plan.json`.
- The static site is Chinese-first (`zh-CN`), so Chinese blog content and Chinese metadata are expected.
