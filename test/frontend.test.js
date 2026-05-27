import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");
const css = readFileSync("public/styles.css", "utf8");
const js = readFileSync("public/app.js", "utf8");

test("frontend exposes collapsible sidebar controls", () => {
  assert.match(html, /id="sidebar-toggle"/);
  assert.match(css, /\.app\.sidebar-collapsed\s*\{/);
  assert.match(js, /SIDEBAR_STORAGE_KEY/);
  assert.match(js, /setSidebarCollapsed\(!state\.sidebarCollapsed\)/);
});

test("frontend has compact resizable settings and composer areas", () => {
  assert.match(css, /\.settings-panel\s*\{[^}]*resize:\s*vertical/s);
  assert.match(css, /\.settings-panel\s*\{[^}]*min-height:\s*74px/s);
  assert.match(css, /\.composer\s*\{[^}]*resize:\s*vertical/s);
  assert.match(css, /textarea\s*\{[^}]*resize:\s*vertical/s);
});

test("frontend supports selecting and rendering attachments", () => {
  assert.match(html, /id="attachments"[^>]*type="file"[^>]*multiple/);
  assert.match(html, /id="attachment-list"/);
  assert.match(js, /addAttachments\(\[\.\.\.attachmentInput\.files\]\)/);
  assert.match(js, /attachments,\s*webSearchEnabled/);
  assert.match(js, /renderMessageAttachments/);
});

test("frontend uses summarized history title and full title tooltip", () => {
  assert.match(js, /conversation\.summaryTitle\s*\|\|\s*conversation\.title/);
  assert.match(js, /title="\$\{escapeHtml\(conversation\.title\)\}"/);
  assert.match(js, /conversationTitle\.title\s*=\s*title/);
});
