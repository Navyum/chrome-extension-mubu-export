import { EXPORT_FORMATS, MUBU_API } from './constants.js';

export function buildExportPayload(definition, exportType, fileMeta = {}) {
  const format = EXPORT_FORMATS[exportType] || EXPORT_FORMATS.md;
  let content = '';

  switch (exportType) {
    case 'opml':
      content = definitionToOpml(definition, fileMeta);
      break;
    case 'json':
      content = JSON.stringify(definition, null, 2);
      break;
    case 'mm':
      content = definitionToFreemind(definition, fileMeta);
      break;
    case 'html':
      content = definitionToHtml(definition, fileMeta);
      break;
    case 'docx':
      content = definitionToDocx(definition, fileMeta);
      break;
    default:
      content = definitionToMarkdown(definition);
  }

  if (!content.endsWith('\n')) {
    content += '\n';
  }

  return {
    content,
    extension: format.extension,
    mime: format.mime
  };
}

function definitionToMarkdown(definition) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  if (!nodes.length) return '';

  const lines = [];

  const traverse = (items, depth) => {
    items.forEach(node => {
      const indent = '  '.repeat(depth);
      const bulletPrefix = `${indent}- `;
      const continuationPrefix = `${indent}  `;
      const notePrefix = `${'  '.repeat(depth + 1)}> `;

      const parts = buildNodeContentParts(node);
      appendMarkdownLines(lines, bulletPrefix, continuationPrefix, parts[0] ?? '(空)');
      parts.slice(1).forEach(part => {
        appendMarkdownLines(lines, continuationPrefix, continuationPrefix, part);
      });

      if (node.note) {
        const note = htmlToFormattedMarkdown(node.note);
        if (note) {
          appendMarkdownLines(lines, notePrefix, notePrefix, note);
        }
      }

      if (Array.isArray(node.children) && node.children.length) {
        traverse(node.children, depth + 1);
      }
    });
  };

  traverse(nodes, 0);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function buildNodeContentParts(node = {}) {
  const parts = [];
  const headingLevel = (Number.isInteger(node.heading) && node.heading > 0)
    ? Math.min(6, node.heading)
    : 0;
  const textContent = htmlToFormattedMarkdown(node.text);

  if (textContent) {
    parts.push(headingLevel ? `${'#'.repeat(headingLevel)} ${textContent}` : textContent);
  } else if (headingLevel) {
    parts.push(`${'#'.repeat(headingLevel)} (空)`);
  }

  const images = extractImageListFromNode(node);
  if (images.length) {
    const altBase = sanitizeMarkdownText(htmlToPlainText(node.text) || 'image');
    images.forEach((img, index) => {
      const imageMarkdown = buildImageMarkdown(img, `${altBase || 'image'}-${index + 1}`);
      if (imageMarkdown) {
        parts.push(imageMarkdown);
      }
    });
  }

  if (!parts.length) {
    parts.push('(空)');
  }

  return parts;
}

function extractImageListFromNode(node = {}) {
  const images = [];
  if (node.image && typeof node.image === 'object') {
    images.push(node.image);
  }
  if (Array.isArray(node.images)) {
    node.images.forEach(image => {
      if (image && typeof image === 'object') {
        images.push(image);
      }
    });
  }
  if (Array.isArray(node.imageList)) {
    node.imageList.forEach(image => {
      if (image && typeof image === 'object') {
        images.push(image);
      }
    });
  }
  return images;
}

function normalizeMubuImageUrl(uri = '') {
  if (!uri || typeof uri !== 'string') {
    return '';
  }
  return uri.startsWith('http')
    ? uri
    : `${MUBU_API.IMAGE_HOST}${uri.replace(/^\/+/, '')}`;
}

function buildImageMarkdown(image = {}, fallbackAlt = 'image') {
  const normalizedUri = normalizeMubuImageUrl(image.uri || image.url);
  if (!normalizedUri) {
    return '';
  }

  const width = Number(image.w || image.width);
  const widthSuffix = Number.isFinite(width) && width > 0
    ? `${normalizedUri.includes('?') ? '&' : '?'}x-tos-process=image/resize,w_${Math.round(width)}`
    : '';

  const alt = sanitizeMarkdownText(image.alt || image.name || fallbackAlt) || 'image';
  return `![${alt}](${normalizedUri}${widthSuffix})`;
}

function sanitizeMarkdownText(text = '') {
  return (text || '')
    .replace(/\r|\n/g, ' ')
    .replace(/[\[\]\(\)`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function appendMarkdownLines(lines, firstPrefix, continuationPrefix, content) {
  const value = (content === undefined || content === null || content === '') ? '(空)' : String(content);
  const fragments = value.split('\n');
  fragments.forEach((fragment, index) => {
    const prefix = index === 0 ? firstPrefix : continuationPrefix;
    lines.push(`${prefix}${fragment}`.trimEnd());
  });
}

function definitionToOpml(definition, fileMeta = {}) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const rawTitle = typeof fileMeta?.title === 'string' ? fileMeta.title.trim() : '';
  const opmlTitle = escapeXml(rawTitle || 'Mubu Export');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${opmlTitle}</title></head>`,
    '  <body>'
  ];

  const traverse = (items, depth) => {
    items.forEach(node => {
      const indent = '  '.repeat(depth + 1);
      const text = escapeXml(htmlToPlainText(node.text) || '空节点');
      lines.push(`${indent}<outline text="${text}">`);

      if (node.note) {
        const note = escapeXml(htmlToPlainText(node.note));
        if (note) {
          lines.push(`${indent}  <note>${note}</note>`);
        }
      }

      if (Array.isArray(node.children) && node.children.length) {
        traverse(node.children, depth + 1);
      }

      lines.push(`${indent}</outline>`);
    });
  };

  traverse(nodes, 0);
  lines.push('  </body>', '</opml>');
  return lines.join('\n');
}

function definitionToFreemind(definition, fileMeta = {}) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const rootTitle = sanitizeFreemindAttribute(fileMeta?.title || 'Mubu 导出');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<map version="1.0.1">',
    `  <node TEXT="${rootTitle}" ID="root">`
  ];

  let autoId = 0;
  const generateNodeId = rawId => {
    if (rawId && typeof rawId === 'string') {
      const normalized = rawId.replace(/[^A-Za-z0-9_-]/g, '_');
      if (normalized) {
        return normalized;
      }
    }
    autoId += 1;
    return `mubu_${autoId}`;
  };

  const buildNoteHtml = node => {
    const noteParts = [];
    const noteText = htmlToPlainText(node?.note);
    if (noteText) {
      noteParts.push(noteText);
    }
    const imageLinks = extractImageListFromNode(node)
      .map(image => normalizeMubuImageUrl(image?.uri || image?.url))
      .filter(Boolean);
    if (imageLinks.length) {
      noteParts.push(['图片链接：', ...imageLinks].join('\n'));
    }
    if (!noteParts.length) {
      return '';
    }
    const merged = noteParts.join('\n\n');
    const paragraphs = merged
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length)
      .map(line => `<p>${escapeXml(line)}</p>`)
      .join('');
    return paragraphs || `<p>${escapeXml(merged.trim())}</p>`;
  };

  const traverse = (items, depth) => {
    items.forEach(node => {
      const indent = '  '.repeat(depth);
      const text = sanitizeFreemindAttribute(htmlToPlainText(node?.text) || '空节点');
      const foldedAttr = node?.collapsed ? ' FOLDED="true"' : '';
      const nodeId = generateNodeId(node?.id);
      lines.push(`${indent}<node TEXT="${text}" ID="${nodeId}"${foldedAttr}>`);

      const noteHtml = buildNoteHtml(node);
      if (noteHtml) {
        lines.push(`${indent}  <richcontent TYPE="NOTE"><html><head></head><body>${noteHtml}</body></html></richcontent>`);
      }

      if (Array.isArray(node?.children) && node.children.length) {
        traverse(node.children, depth + 1);
      }

      lines.push(`${indent}</node>`);
    });
  };

  if (nodes.length) {
    traverse(nodes, 2);
  }

  lines.push('  </node>', '</map>');
  return lines.join('\n');
}

function sanitizeFreemindAttribute(value = '') {
  const safe = (value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return escapeXml(safe || '空节点');
}

function replaceFormulaSpansWithText(html) {
  // Replace formula spans with decoded LaTeX plain text for Word compatibility
  return html.replace(/<span[^>]*class\s*=\s*["'][^"']*\bformula\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, (match) => {
    const rawMatch = match.match(/data-raw\s*=\s*["']([^"']*)["']/i);
    if (rawMatch && rawMatch[1]) {
      try { return decodeURIComponent(rawMatch[1]); } catch { return rawMatch[1]; }
    }
    return '';
  });
}

function stripEmoji(text) {
  // Remove emoji and other non-BMP characters that cause Word garbled text
  return text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2300}-\u{23FF}]|[\u{2600}-\u{27BF}]|[\u{2B50}-\u{2B55}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]|[\u{2702}-\u{27B0}]|[\u{24C2}]|[\u{1FA00}-\u{1FAFF}]|[\u{FE0F}]|[\u{200B}-\u{200D}]/gu, '').trim();
}

function cleanTextForWord(text) {
  let result = replaceFormulaSpansWithText(text);
  // Strip editor artifacts
  result = result.replace(/<div[^>]*class="(?:column-select-btn|row-select-btn)"[^>]*><\/div>/gi, '');
  result = result.replace(/<div[^>]*class="table-container"[^>]*>/gi, '');
  result = result.replace(/\s*(?:contenteditable|tabindex)\s*=\s*"[^"]*"/gi, '');
  // Strip emoji from visible text (but not from inside HTML tags)
  result = result.replace(/>([^<]*)</g, (match, text) => '>' + stripEmoji(text) + '<');
  // Also strip leading/trailing emoji outside tags
  result = stripEmoji(result);
  return result;
}

function definitionToDocx(definition, fileMeta = {}) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const title = escapeXml(stripEmoji((fileMeta?.title || 'Mubu 导出').trim()) || 'Mubu 导出');

  const lines = [];
  // Word-compatible bullet: use &#8226; (•) character, works everywhere
  const BULLET = '<span style="color:#646a73;font-size:14pt;margin-right:6pt;">&#8226;</span>';

  function renderNodes(items, depth) {
    items.forEach(node => {
      const headingLevel = (Number.isInteger(node.heading) && node.heading > 0)
        ? Math.min(3, node.heading) : 0;

      let textContent = cleanTextForWord(node.text || '');
      // Convert tables to clean Word-compatible HTML
      textContent = textContent.replace(/<table[\s\S]*?<\/table>/gi, match => {
        const rows = parseTableRows(match);
        if (!rows.length) return '';
        const colCount = Math.max(...rows.map(r => r.length));
        let t = '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:8pt 0;width:100%;">';
        rows.forEach((row, ri) => {
          t += '<tr>';
          for (let ci = 0; ci < colCount; ci++) {
            const tag = ri === 0 ? 'th' : 'td';
            const bgStyle = ri === 0 ? 'background-color:#f2f3f5;font-weight:bold;' : '';
            t += `<${tag} style="border:1pt solid #bfc0c1;padding:6pt 9pt;${bgStyle}">${escapeXml(stripEmoji(row[ci] || ''))}</${tag}>`;
          }
          t += '</tr>';
        });
        t += '</table>';
        return t;
      });

      const indent = depth * 18;
      const finishedStyle = node.completed || node.finish ? 'text-decoration:line-through;color:#999;' : '';
      const fontStyle = `font-size:11pt;line-height:1.8;font-family:'PingFang SC','Microsoft YaHei','SimSun',sans-serif;`;

      if (headingLevel) {
        lines.push(`<h${headingLevel} style="color:#1f2933;margin:14pt 0 6pt ${indent}pt;font-family:'PingFang SC','Microsoft YaHei','SimSun',sans-serif;">${BULLET}${textContent || '(空)'}</h${headingLevel}>`);
      } else if (textContent.includes('<table')) {
        lines.push(`<div style="margin:3pt 0 3pt ${indent}pt;${fontStyle}${finishedStyle}">${BULLET}${textContent}</div>`);
      } else {
        lines.push(`<p style="margin:3pt 0 3pt ${indent}pt;${fontStyle}${finishedStyle}">${BULLET}${textContent || '(空)'}</p>`);
      }

      // Note
      if (node.note) {
        const noteText = cleanTextForWord(node.note);
        lines.push(`<div style="margin:2pt 0 6pt ${(depth + 1) * 18}pt;padding:4pt 10pt;border-left:3pt solid #d0d5dd;color:#666;font-size:10pt;line-height:1.5;font-family:'PingFang SC','Microsoft YaHei','SimSun',sans-serif;">${noteText}</div>`);
      }

      // Images
      const images = extractImageListFromNode(node);
      images.forEach(image => {
        const src = normalizeMubuImageUrl(image?.uri || image?.url);
        if (src) {
          lines.push(`<p style="margin:4pt 0 4pt ${(depth + 1) * 18}pt;"><img src="${src}" style="max-width:400pt;" /></p>`);
        }
      });

      if (Array.isArray(node.children) && node.children.length) {
        renderNodes(node.children, depth + 1);
      }
    });
  }

  renderNodes(nodes, 0);

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2cm; }
body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #333; line-height: 1.6; }
table { border-collapse: collapse; }
h1 { font-size: 22pt; font-weight: 600; border-bottom: 1pt solid #e5e6e8; padding-bottom: 10pt; margin-bottom: 14pt; }
h2 { font-size: 16pt; font-weight: 600; }
h3 { font-size: 13pt; font-weight: 600; }
</style>
</head>
<body>
<h1 style="font-family:'PingFang SC','Microsoft YaHei',sans-serif;">${title}</h1>
${lines.join('\n')}
</body>
</html>`;
}

const MUBU_HTML_STYLE = `
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html { margin: 0; padding: 0; }
body { margin: 50px 20px; padding: 0; color: #333; font-family: 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'PingFang SC', Helvetica, Arial, 'Microsoft YaHei', sans-serif; }
body.narrow { max-width: 790px; margin-left: auto; margin-right: auto; padding-left: 20px; padding-right: 20px; }
.title { min-height: 40px; padding-left: 10px; padding-bottom: 24px; margin-bottom: 20px; line-height: 40px; font-size: 26px; font-weight: 500; border-bottom: 1px solid #e5e6e8; }
.node-list { margin: 0 0 0 28px; padding: 0; list-style: none; }
.node { position: relative; }
.content { min-height: 24px; padding-top: 2px; padding-bottom: 3px; line-height: 24px; font-size: 16px; }
.note { position: relative; padding-bottom: 2px; line-height: 22px; font-size: 14px; color: #888; white-space: pre-wrap; }
.content > *, .note > * { padding-top: 2px; padding-bottom: 2px; }
.node.finished .content, .node.finished .note { opacity: 0.5; }
.node.finished > .content { text-decoration: line-through; }
.heading1 > .content { min-height: 34px; line-height: 34px; font-size: 24px; font-weight: 500; }
.heading2 > .content { min-height: 30px; line-height: 30px; font-size: 21px; font-weight: 500; }
.heading3 > .content { min-height: 27px; line-height: 27px; font-size: 19px; font-weight: 500; }
.bold { font-weight: bold; }
.italic { font-style: italic; }
.underline { text-decoration: underline; text-underline-offset: 5px; }
.strikethrough { text-decoration: line-through; opacity: 0.5; }
.content .highlight-red, .highlight-red > .content > * { background-color: #ff8c8c99; }
.content .highlight-yellow, .highlight-yellow > .content > * { background-color: #ffff2699; }
.content .highlight-blue, .highlight-blue > .content > * { background-color: #8ce5ff99; }
.content .highlight-cyan, .highlight-cyan > .content > * { background-color: #a3ffca99; }
.content .highlight-pink, .highlight-pink > .content > * { background-color: #f3a6ff99; }
.content .highlight-olive, .highlight-olive > .content > * { background-color: #c8ff8c99; }
.content .highlight-grey, .highlight-grey > .content > * { background-color: #b1b6be99; }
.text-color-red { color: #dc2d1e; }
.text-color-yellow { color: #ffaf38; }
.text-color-green { color: #75c940; }
.text-color-blue { color: #3da8f5; }
.text-color-purple { color: #797ec9; }
.bullet { position: absolute; left: -25px; top: 5px; width: 18px; height: 18px; border-radius: 9px; }
.node.collapsed > .bullet { background-color: #dee0e3; }
.heading1 > .bullet { top: 10px; }
.heading2 > .bullet { top: 8px; }
.heading3 > .bullet { top: 6px; }
.bullet-dot { position: absolute; left: 6px; top: 6px; width: 6px; height: 6px; background-color: rgb(100, 106, 115); border-radius: 3px; }
.image-list { position: relative; margin: 0; padding: 0; list-style: none; }
.image-item { padding-top: 2px; padding-bottom: 8px; }
.image { display: block; max-width: 100%; }
.children { position: relative; }
.note::before, .image-list::before, .children::before { content: ""; position: absolute; top: 0; left: -17px; width: 1px; height: 100%; background-color: #dee0e3; }
.auto-table { table-layout: auto; border-collapse: collapse; white-space: normal; border: none; }
.auto-table td, .auto-table th { max-width: 360px; height: 16px; padding: 6px 9px; text-align: start; word-break: break-word; vertical-align: middle; border: 1px solid #bfc0c1; font-weight: normal; }
.table-container { overflow-x: auto; width: 100%; padding: 8px; max-width: 100%; margin-left: -7px; }
.column-select-btn, .row-select-btn { display: none; }
.codespan:not(.pseudo-node) { background-color: #ebecec; color: #bc4e3a !important; font-size: calc(1em - 2px); border-radius: 4px; padding: 2px 6px; margin: 0 2px; font-family: SourceCodePro, monospace; }
.formula { cursor: default; }
@media print {
  body { margin-top: 0; margin-bottom: 0; }
  .content .highlight-red, .highlight-red > .content > * { background-color: #ffbaba; }
  .content .highlight-yellow, .highlight-yellow > .content > * { background-color: #ffff7d; }
  .content .highlight-blue, .highlight-blue > .content > * { background-color: #baefff; }
  .content .highlight-cyan, .highlight-cyan > .content > * { background-color: #c8ffdf; }
  .content .highlight-pink, .highlight-pink > .content > * { background-color: #f8caff; }
  .content .highlight-olive, .highlight-olive > .content > * { background-color: #deffba; }
  .content .highlight-grey, .highlight-grey > .content > * { background-color: #d0d3d8; }
}
@page { margin-left: 0.25in; margin-right: 0.25in; margin-top: 0.5in; margin-bottom: 0.5in; }
`;

function definitionToHtml(definition, fileMeta = {}) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const title = escapeXml((fileMeta?.title || 'Mubu 导出').trim() || 'Mubu 导出');
  const lines = [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8"/>',
    '  <meta content="IE=edge" http-equiv="X-UA-Compatible"/>',
    '  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>',
    '  <meta content="width=device-width, initial-scale=1, maximum-scale=1" name="viewport"/>',
    `  <title>${title}</title>`,
    '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>',
    '  <style>',
    MUBU_HTML_STYLE,
    '  </style>',
    '</head>',
    '<body class="narrow">',
    `  <div class="title">${title}</div>`
  ];

  if (nodes.length) {
    renderNodeList(nodes, 1);
  } else {
    lines.push('  <p>暂无内容。</p>');
  }

  // KaTeX rendering script for formulas
  lines.push('  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>');
  lines.push('  <script>');
  lines.push('    document.addEventListener("DOMContentLoaded", function() {');
  lines.push('      if (typeof katex === "undefined") return;');
  lines.push('      document.querySelectorAll(".formula[data-raw]").forEach(function(el) {');
  lines.push('        try {');
  lines.push('          var tex = decodeURIComponent(el.getAttribute("data-raw"));');
  lines.push('          katex.render(tex, el, { throwOnError: false, displayMode: false });');
  lines.push('        } catch(e) {}');
  lines.push('      });');
  lines.push('    });');
  lines.push('  </script>');
  lines.push('</body>', '</html>');
  return lines.join('\n');

  function renderNodeList(items, depth) {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}<ul class="node-list">`);
    items.forEach(node => {
      const headingClass = node.heading ? ` heading${Math.min(3, node.heading)}` : '';
      const finishedClass = node.completed ? ' finished' : '';
      const collapsedClass = node.collapsed ? ' collapsed' : '';
      lines.push(`${indent}  <li class="node${headingClass}${finishedClass}${collapsedClass}">`);
      lines.push(`${indent}    <div class="bullet"><div class="bullet-dot"></div></div>`);
      // Render content: preserve original rich HTML (formulas, tables, formatting)
      const contentHtml = node.text || '';
      lines.push(`${indent}    <div class="content mm-editor">${contentHtml}</div>`);

      if (node.note) {
        lines.push(`${indent}    <div class="note">${node.note}</div>`);
      }

      const images = extractImageListFromNode(node);
      if (images.length) {
        lines.push(`${indent}    <ul class="image-list">`);
        images.forEach(image => {
          const src = normalizeMubuImageUrl(image?.uri || image?.url);
          if (src) {
            lines.push(`${indent}      <li class="image-item"><img class="image" src="${src}" loading="lazy"/></li>`);
          }
        });
        lines.push(`${indent}    </ul>`);
      }

      if (Array.isArray(node?.children) && node.children.length) {
        lines.push(`${indent}    <div class="children">`);
        renderNodeList(node.children, depth + 2);
        lines.push(`${indent}    </div>`);
      }
      lines.push(`${indent}  </li>`);
    });
    lines.push(`${indent}</ul>`);
  }
}



function htmlToFormattedMarkdown(input = '') {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let html = input;
  // Convert tables to Markdown before any other processing
  // Only match <table>...</table> directly — avoid matching the wrapper div
  // because nested inner divs (column-select-btn etc.) break lazy </div> matching
  html = html.replace(/<table[\s\S]*?<\/table>/gi, match => convertTableToMarkdown(match));

  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<\/(p|div|h\d)>/gi, '\n');
  html = html.replace(/<li[^>]*>/gi, '\n- ');
  html = transformSpanMarkup(html);

  html = wrapSimpleTags(html, ['strong', 'b'], content => wrapWithMarkers(content, '**'));
  html = wrapSimpleTags(html, ['em', 'i'], content => wrapWithMarkers(content, '*'));
  html = wrapSimpleTags(html, ['code'], content => (content.trim() ? `\`${content.trim()}\`` : content));
  html = wrapSimpleTags(html, ['u'], content => (content.trim() ? `<u>${content.trim()}</u>` : content));
  html = wrapSimpleTags(html, ['s', 'del', 'strike'], content => wrapWithMarkers(content, '~~'));

  html = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner = '') => {
    const cleaned = inner.trim();
    return cleaned ? `\n\`\`\`\n${cleaned}\n\`\`\`\n` : '';
  });

  html = html.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href = '', inner = '') => {
    const label = inner.trim() || href;
    const safeHref = (href || '').replace(/\)/g, '\\)');
    return safeHref ? `[${label}](${safeHref})` : label;
  });

  html = html.replace(/<img[^>]*>/gi, match => convertInlineImageTag(match));

  html = stripDisallowedTags(html);

  return decodeHtmlEntities(html)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n')
    .trim();
}

const ALLOWED_INLINE_TAGS = new Set(['mark', 'span', 'u']);

function stripDisallowedTags(input = '') {
  if (!input) return '';
  return input.replace(/<\/?([a-z0-9-]+)(?:[^>]*?)>/gi, (match, tagName = '') => {
    return ALLOWED_INLINE_TAGS.has(tagName.toLowerCase()) ? match : '';
  });
}

function transformSpanMarkup(html = '') {
  if (!html) return '';

  const spanRegex = /<span([^>]*)>([\s\S]*?)<\/span>/gi;
  return html.replace(spanRegex, (match, attrs = '', inner = '') => {
    const classes = extractClassList(attrs);

    // Handle formula spans: extract LaTeX from data-raw attribute
    if (classes.includes('formula')) {
      const latex = extractDataRawLatex(attrs);
      return latex ? `$${latex}$` : '';
    }

    const transformedInner = transformSpanMarkup(inner);
    const hasOtherAttributes = hasNonClassAttributes(attrs);

    if (!classes.length && !hasOtherAttributes) {
      return transformedInner;
    }

    if (!classes.length) {
      return match;
    }

    const transformed = applyClassTokens(classes, transformedInner);
    return transformed === transformedInner ? transformedInner : transformed;
  });
}

function extractDataRawLatex(attrs = '') {
  const match = attrs.match(/data-raw\s*=\s*["']([^"']*)["']/i);
  if (!match || !match[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function wrapSimpleTags(html, tags, formatter) {
  return tags.reduce((acc, tag) => {
    const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    return acc.replace(regex, (_, inner = '') => formatter(inner));
  }, html);
}

function wrapWithMarkers(content, marker) {
  const value = content.trim();
  return value ? `${marker}${value}${marker}` : content;
}

function convertInlineImageTag(tagHtml) {
  const srcMatch = tagHtml.match(/src\s*=\s*["']([^"']+)["']/i);
  if (!srcMatch) return '';
  const altMatch = tagHtml.match(/alt\s*=\s*["']([^"']*)["']/i);
  const alt = sanitizeMarkdownText(altMatch ? altMatch[1] : 'image') || 'image';
  const src = srcMatch[1];
  return `![${alt}](${src})`;
}

function extractClassList(attrs = '') {
  const match = attrs.match(/class\s*=\s*["']([^"']+)["']/i);
  if (!match) return [];
  return match[1]
    .split(/\s+/)
    .map(cls => cls.trim())
    .filter(Boolean);
}

function hasNonClassAttributes(attrs = '') {
  if (!attrs) return false;
  const withoutClass = attrs.replace(/class\s*=\s*["'][^"']*["']/i, '');
  return withoutClass.trim().length > 0;
}

function applyClassTokens(classes = [], content = '') {
  let result = typeof content === 'string' ? content : '';
  if (!result.trim()) {
    return result;
  }

  if (classes.includes('codespan')) {
    result = `\`${result.trim()}\``;
  }
  if (classes.includes('bold')) {
    result = ` **${result.trim()}** `;
  }
  if (classes.includes('italic')) {
    result = ` *${result.trim()}* `;
  }
  if (classes.includes('underline')) {
    result = ` <u>${result.trim()}</u> `;
  }
  if (classes.includes('strikethrough')) {
    result = ` ~~${result.trim()}~~ `;
  }

  const textColorClass = classes.find(cls => cls.startsWith('text-color-'));
  if (textColorClass) {
    const colorToken = textColorClass.replace('text-color-', '').trim().toLowerCase();
    result = `<span style="color:${tokenToColor(colorToken)};">${result}</span>`;
  }

  const highlightClass = classes.find(cls => cls.startsWith('highlight-'));
  if (highlightClass) {
    const colorToken = highlightClass.replace('highlight-', '').trim().toLowerCase();
    result = `<mark style="background-color:${tokenToHighlightColor(colorToken)};">${result}</mark>`;
  }

  return result;
}

function decodeHtmlEntities(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'');
}

function tokenToColor(token) {
  const colorMap = {
    red: '#ef4444',
    orange: '#fb923c',
    yellow: '#fbbf24',
    green: '#22c55e',
    blue: '#3b82f6',
    purple: '#a855f7',
    pink: '#ec4899',
    gray: '#6b7280',
    grey: '#6b7280',
    black: '#111827'
  };
  return colorMap[token] || token || '#111827';
}

function tokenToHighlightColor(token) {
  const highlightMap = {
    red: '#fde8e8',
    orange: '#ffedd5',
    yellow: '#fef3c7',
    green: '#dcfce7',
    blue: '#dbeafe',
    purple: '#ede9fe',
    pink: '#fce7f3',
    gray: '#f5f5f5',
    grey: '#f5f5f5'
  };
  return highlightMap[token] || '#fff3bf';
}

function htmlToPlainText(input = '') {
  if (!input) return '';
  let text = input;
  // Convert tables to plain text before stripping tags
  text = text.replace(/<table[\s\S]*?<\/table>/gi, match => convertTableToPlainText(match));
  // Extract formula spans before stripping tags
  text = text.replace(/<span[^>]*class\s*=\s*["'][^"']*\bformula\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, (match, _inner) => {
    const rawMatch = match.match(/data-raw\s*=\s*["']([^"']*)["']/i);
    if (rawMatch && rawMatch[1]) {
      try { return decodeURIComponent(rawMatch[1]); } catch { return rawMatch[1]; }
    }
    return '';
  });
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|li|h\d)>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, '\'');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\r/g, '');
  text = text.replace(/\u00a0/g, ' ');

  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

function escapeXml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractCellText(cellHtml = '') {
  // Extract text from edit-area spans first, then fall back to stripping all tags
  const editAreaTexts = [];
  const editAreaRegex = /<span[^>]*class="edit-area"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = editAreaRegex.exec(cellHtml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').trim();
    editAreaTexts.push(text);
  }
  if (editAreaTexts.length) {
    return editAreaTexts.join(' ').trim();
  }
  // Fallback: strip all tags
  return cellHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim();
}

function parseTableRows(tableHtml = '') {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
      cells.push(extractCellText(cellMatch[1]));
    }
    if (cells.length) {
      rows.push(cells);
    }
  }
  return rows;
}

function convertTableToMarkdown(tableHtml = '') {
  const rows = parseTableRows(tableHtml);
  if (!rows.length) return '';

  // Normalize column count
  const colCount = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(r => {
    while (r.length < colCount) r.push('');
    return r;
  });

  // Escape pipe characters in cell content
  const escape = s => s.replace(/\|/g, '\\|');

  const lines = [];
  // Header row
  lines.push('| ' + normalized[0].map(escape).join(' | ') + ' |');
  // Separator
  lines.push('| ' + normalized[0].map(() => '---').join(' | ') + ' |');
  // Body rows
  normalized.slice(1).forEach(row => {
    lines.push('| ' + row.map(escape).join(' | ') + ' |');
  });

  return '\n' + lines.join('\n') + '\n';
}

function convertTableToPlainText(tableHtml = '') {
  // Output Markdown table syntax (matches Mubu's official .mm/.opml export behavior)
  const rows = parseTableRows(tableHtml);
  if (!rows.length) return '';
  const colCount = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(r => {
    while (r.length < colCount) r.push('');
    return r;
  });
  const escape = s => s.replace(/\|/g, '\\|');
  const lines = [];
  lines.push('| ' + normalized[0].map(escape).join(' | ') + ' |');
  lines.push('| ' + normalized[0].map(() => '---').join(' | ') + ' |');
  normalized.slice(1).forEach(row => {
    lines.push('| ' + row.map(escape).join(' | ') + ' |');
  });
  return '\n' + lines.join('\n') + '\n';
}



