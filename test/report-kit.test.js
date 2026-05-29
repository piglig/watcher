import { describe, it, expect } from 'vitest';
import {
  escapeHtml, h, badge, htmlShell, mdEscape, html, raw, jsonForScript,
} from '../src/shared/report-kit.js';

describe('escapeHtml', () => {
  it('escapes the four core HTML metacharacters', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('escapes & first so existing entities are not double-mangled incorrectly', () => {
    // & must be replaced before <,>," — verify ampersand always becomes &amp;
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('coerces null/undefined to empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces numbers to their string form', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('h is an alias of escapeHtml', () => {
    expect(h).toBe(escapeHtml);
  });

  // KNOWN GAP (architecture audit finding): single quotes are NOT escaped.
  // This is safe only as long as every attribute interpolation uses double
  // quotes. This test documents the current behavior so a future change to
  // also escape "'" is a deliberate, visible decision rather than a surprise.
  it("does NOT currently escape single quotes (documented limitation)", () => {
    expect(escapeHtml("it's")).toBe("it's");
  });
});

describe('mdEscape', () => {
  it('escapes pipes and flattens newlines for table cells', () => {
    expect(mdEscape('a|b\nc')).toBe('a\\|b c');
  });
  it('coerces null/undefined to empty string', () => {
    expect(mdEscape(null)).toBe('');
    expect(mdEscape(undefined)).toBe('');
  });
});

describe('html`` + raw', () => {
  it('escapes interpolated values by default', () => {
    const out = String(html`<p>${'<script>'}</p>`);
    expect(out).toBe('<p>&lt;script&gt;</p>');
  });

  it('emits raw()-wrapped values verbatim', () => {
    const inner = raw('<b>bold</b>');
    expect(String(html`<p>${inner}</p>`)).toBe('<p><b>bold</b></p>');
  });

  it('flattens arrays and escapes their elements', () => {
    const rows = ['<a>', '<b>'].map(x => html`<li>${x}</li>`);
    expect(String(html`<ul>${rows}</ul>`)).toBe('<ul><li>&lt;a&gt;</li><li>&lt;b&gt;</li></ul>');
  });

  it('drops null/undefined/false interpolations', () => {
    expect(String(html`<p>${null}${undefined}${false}</p>`)).toBe('<p></p>');
  });

  it('nests html`` results without double-escaping', () => {
    const child = html`<span>${'a&b'}</span>`;
    expect(String(html`<div>${child}</div>`)).toBe('<div><span>a&amp;b</span></div>');
  });

  it('result stringifies to its HTML for direct use', () => {
    expect(`${html`<i>${'x'}</i>`}`).toBe('<i>x</i>');
  });
});

describe('jsonForScript', () => {
  it('escapes </script> so it cannot terminate the tag', () => {
    const out = jsonForScript({ t: '</script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c');
  });

  it('round-trips back to the original value via JSON.parse', () => {
    const value = { a: '</script>', b: ['<x>', '&y'], n: 3 };
    // The escaped sequences are valid JSON string escapes, so JSON.parse
    // restores the original payload exactly.
    expect(JSON.parse(jsonForScript(value))).toEqual(value);
  });

  it('escapes & to avoid HTML entity decoding inside the script context', () => {
    expect(jsonForScript('a&b')).toContain('\\u0026');
  });

  it('escapes U+2028 / U+2029 line separators', () => {
    const out = jsonForScript(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).not.toContain(String.fromCharCode(0x2029));
  });

  it('serializes null/undefined to null', () => {
    expect(jsonForScript(undefined)).toBe('null');
    expect(jsonForScript(null)).toBe('null');
  });
});

describe('badge', () => {
  it('wraps text in a badge span with the variant class and escapes the text', () => {
    const out = badge('<b>yes</b>', 'yes');
    expect(out).toContain('badge-yes');
    expect(out).toContain('&lt;b&gt;yes&lt;/b&gt;');
    expect(out).not.toContain('<b>yes</b>');
  });
});

describe('htmlShell', () => {
  it('produces a full document embedding the body verbatim', () => {
    const doc = htmlShell({ title: 'T', body: '<p>hello</p>' });
    expect(doc).toMatch(/^<!DOCTYPE html>/i);
    expect(doc).toContain('<p>hello</p>');
  });

  it('escapes the title but not the body (body is trusted pre-built HTML)', () => {
    const doc = htmlShell({ title: '<script>', body: '<p>ok</p>' });
    expect(doc).toContain('&lt;script&gt;');
    expect(doc).toContain('<p>ok</p>');
  });

  it('defaults the lang attribute to zh-CN and honors an override', () => {
    expect(htmlShell({ title: 't', body: '' })).toContain('lang="zh-CN"');
    expect(htmlShell({ title: 't', body: '', lang: 'en' })).toContain('lang="en"');
  });

  it('injects extraCss and scripts when provided', () => {
    const doc = htmlShell({
      title: 't', body: '', extraCss: '.x{color:red}', scripts: 'console.log(1)',
    });
    expect(doc).toContain('.x{color:red}');
    expect(doc).toContain('console.log(1)');
  });
});
