import { translateHtmlPreservingMarkup } from '../src/shared/email-ai/translateHtmlPreservingMarkup.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function testTranslateHtmlPreservesImagesLinksAndStyles() {
  const html = [
    '<div style="color:#ff0000;font-size:18px" class="hero">',
    '<p>Hello <strong>world</strong></p>',
    '<p>Visit https://example.com/path?token=abc123 today.</p>',
    '<a href="https://example.com/action" style="text-decoration:none">Click here</a>',
    '<img src="https://cdn.example.com/banner.png" alt="banner" width="320" />',
    '</div>',
  ].join('');

  const translated = await translateHtmlPreservingMarkup(html, async (segments) => {
    return segments.map((segment) => segment.replace('Hello', '你好').replace('world', '世界').replace('Visit', '访问').replace('today.', '今天。').replace('Click here', '点击这里'));
  });

  assert(translated.includes('style="color:#ff0000;font-size:18px"'), 'Expected original inline style to remain');
  assert(translated.includes('class="hero"'), 'Expected original class attribute to remain');
  assert(translated.includes('<img src="https://cdn.example.com/banner.png" alt="banner" width="320">') || translated.includes('<img src="https://cdn.example.com/banner.png" alt="banner" width="320" />'), 'Expected image node to remain intact');
  assert(translated.includes('href="https://example.com/action"'), 'Expected link href to remain intact');
  assert(translated.includes('你好'), 'Expected text nodes to be translated');
  assert(translated.includes('世界'), 'Expected nested text nodes to be translated');
  assert(translated.includes('点击这里'), 'Expected visible link text to be translated');
  assert(translated.includes('https://example.com/path?token=abc123'), 'Expected raw URL text to be preserved instead of translated');
}

async function testTranslateHtmlBatchesTextExtractionAndRefill() {
  const paragraphs = Array.from({ length: 65 }, (_, index) => `<p class="line">Line ${index}</p>`).join('');
  const html = `<div style="background:#fff"><img src="https://cdn.example.com/a.png" alt="hero">${paragraphs}</div>`;
  let calls = 0;

  const translated = await translateHtmlPreservingMarkup(html, async (segments) => {
    calls += 1;
    assert(segments.length <= 24, 'Expected HTML translation to batch extracted text segments');
    return segments.map((segment) => `T:${segment}`);
  });

  assert(calls > 1, 'Expected large HTML mail to be translated in multiple segment batches');
  assert(translated.includes('style="background:#fff"'), 'Expected original container style to remain after batched refill');
  assert(translated.includes('<img src="https://cdn.example.com/a.png" alt="hero">') || translated.includes('<img src="https://cdn.example.com/a.png" alt="hero" />'), 'Expected image node to remain after batched refill');
  assert(translated.includes('T:Line 0'), 'Expected first extracted text node to be refilled');
  assert(translated.includes('T:Line 64'), 'Expected last extracted text node to be refilled');
  assert(!translated.includes('Subject:'), 'Expected HTML refill not to introduce cleaned email prompt labels');
}

async function testTranslateHtmlFallsBackPerSegmentWithoutLosingMarkup() {
  const html = [
    '<section style="background:#fff;color:#111">',
    '<h1>Market update</h1>',
    '<p>Open this report today.</p>',
    '<p>Keep https://example.com/report intact.</p>',
    '<img src="https://cdn.example.com/chart.png" alt="chart">',
    '</section>',
  ].join('');
  let calls = 0;

  const translated = await translateHtmlPreservingMarkup(html, async (segments) => {
    calls += 1;
    if (segments.length > 1) {
      throw new Error('simulated batch failure');
    }
    if (segments[0]?.includes('Open this report')) {
      throw new Error('simulated single segment failure');
    }
    return segments.map((segment) => `译:${segment}`);
  });

  assert(calls > 1, 'Expected failed batch translation to retry smaller segment groups');
  assert(translated.includes('style="background:#fff;color:#111"'), 'Expected style to remain after segment-level fallback');
  assert(translated.includes('<img src="https://cdn.example.com/chart.png" alt="chart">') || translated.includes('<img src="https://cdn.example.com/chart.png" alt="chart" />'), 'Expected image to remain after segment-level fallback');
  assert(translated.includes('译:Market update'), 'Expected successful segment to be translated');
  assert(translated.includes('Open this report today.'), 'Expected failed single segment to keep original text instead of failing whole HTML translation');
  assert(translated.includes('https://example.com/report'), 'Expected URL text to remain intact');
}

async function run() {
  await testTranslateHtmlPreservesImagesLinksAndStyles();
  await testTranslateHtmlBatchesTextExtractionAndRefill();
  await testTranslateHtmlFallsBackPerSegmentWithoutLosingMarkup();
  console.log('html translation preserve tests passed');
}

void run();
