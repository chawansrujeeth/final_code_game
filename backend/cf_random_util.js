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
    (p) => ({
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
      contestId: p.contestId,
      index: p.index,
      name: p.name
    })
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
      const match = href.match(/\/problemset\/problem\/(\d+)\/(\w+)/);
      if (match) {
        links.push({
          url: `https://codeforces.com${href}`,
          contestId: match[1],
          index: match[2],
          name: '' // name not available from scrape
        });
      }
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

async function getRandomCFDuelProblem() {
  let problems;
  try {
    problems = await getListViaApi();
  } catch (apiErr) {
    problems = await getListViaScrape();
  }
  const chosen = problems[Math.floor(Math.random() * problems.length)];
  const sample = await scrapeFirstSample(chosen.url);
  return { ...chosen, sample };
}

async function getRandomCFDuelProblemWithPython() {
  let problems;
  try {
    problems = await getListViaApi();
  } catch (apiErr) {
    problems = await getListViaScrape();
  }
  const chosen = problems[Math.floor(Math.random() * problems.length)];
  // Use Python script for sample extraction
  const { getSampleFromPython } = require('./cf_python_sample');
  let sample;
  try {
    sample = await getSampleFromPython(chosen.url);
  } catch (err) {
    // fallback to JS scraping if Python fails
    sample = await scrapeFirstSample(chosen.url);
  }
  return { ...chosen, sample };
}

module.exports = { getRandomCFDuelProblem, getRandomCFDuelProblemWithPython };
