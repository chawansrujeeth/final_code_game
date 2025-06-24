const fetch = require('node-fetch');
const { load } = require('cheerio');

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/115.0.0.0 Safari/537.36',
};

const CF_API = 'https://codeforces.com/api/problemset.problems';

async function getListViaApi() {
  const res = await fetch(CF_API, { headers: HEADERS, timeout: 10000 });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const json = await res.json();
  if (json.status !== 'OK') throw new Error(`CF API error: ${json.comment}`);
  return json.result.problems.map(
    (p) => `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`
  );
}

async function getListViaScrape() {
  const url = 'https://codeforces.com/problemset/?page=1';
  const res = await fetch(url, { headers: HEADERS, timeout: 10000 });
  if (!res.ok) throw new Error(`Scrape fetch returned ${res.status}`);
  const html = await res.text();
  const $ = load(html);
  const links = [];
  $('table.problems tbody tr td.id a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('/problemset/problem/')) {
      links.push(`https://codeforces.com${href}`);
    }
  });
  if (!links.length) throw new Error('No problem links found on page 1');
  return links;
}

async function scrapeFirstSample(problemUrl) {
  const res = await fetch(problemUrl, { headers: HEADERS, timeout: 10000 });
  if (!res.ok) throw new Error(`Problem fetch returned ${res.status}`);
  const html = await res.text();
  const $ = load(html);

  // Try both selectors for robustness
  let inputs = [];
  let outputs = [];
  $('.sample-test .input pre, .sample-test .input > pre').each((_, el) => {
    inputs.push($(el).text().replace(/\r/g, '').trim());
  });
  $('.sample-test .output pre, .sample-test .output > pre').each((_, el) => {
    outputs.push($(el).text().replace(/\r/g, '').trim());
  });

  // Fallback: try just .input and .output if above fails
  if (inputs.length === 0) {
    $('.sample-test .input').each((_, el) => {
      inputs.push($(el).text().replace(/\r/g, '').trim());
    });
  }
  if (outputs.length === 0) {
    $('.sample-test .output').each((_, el) => {
      outputs.push($(el).text().replace(/\r/g, '').trim());
    });
  }

  return {
    input: inputs[0] || null,
    output: outputs[0] || null,
    allInputs: inputs,
    allOutputs: outputs
  };
}

async function getRandomSample(req, res) {
  try {
    let urls;
    try {
      urls = await getListViaApi();
    } catch (apiErr) {
      console.warn('CF API failed, falling back to scrape:', apiErr.message);
      urls = await getListViaScrape();
    }

    const chosen = urls[Math.floor(Math.random() * urls.length)];
    const { input, output } = await scrapeFirstSample(chosen);

    res.status(200).json({
      url: chosen,
      sample: { input, output },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getRandomSample;
