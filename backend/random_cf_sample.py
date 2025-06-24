#!/usr/bin/env python3
# random_cf_sample.py

import requests
import random
from bs4 import BeautifulSoup
import sys
import json

try:
    from cf_companion_style_parser import parse_codeforces_problem
except ImportError as e:
    print(f"ImportError: {e}", file=sys.stderr)
    sys.exit(1)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/115.0.0.0 Safari/537.36"
    )
}

API_URL = "https://codeforces.com/api/problemset.problems"

def get_list_via_api():
    resp = requests.get(API_URL, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "OK":
        raise RuntimeError("CF API error: " + data.get("comment", "no comment"))
    # Build URL list
    return [
        f"https://codeforces.com/problemset/problem/{p['contestId']}/{p['index']}"
        for p in data["result"]["problems"]
    ]

def get_list_via_scrape():
    url = "https://codeforces.com/problemset/?page=1"
    resp = requests.get(url, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    links = []
    for a in soup.select("table.problems tbody tr td.id a"):
        href = a.get("href", "")
        if href.startswith("/problemset/problem/"):
            links.append("https://codeforces.com" + href)
    if not links:
        raise RuntimeError("Scrape fallback: no problem links found on page 1")
    return links

def scrape_first_sample(problem_url):
    resp = requests.get(problem_url, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    samp = soup.select_one(".sample-test")
    if not samp:
        return None, None
    inp = samp.select_one("div.input pre")
    outp = samp.select_one("div.output pre")
    return (
        inp.get_text(strip=True) if inp else None,
        outp.get_text(strip=True) if outp else None
    )

def main():
    if len(sys.argv) > 1:
        chosen = sys.argv[1]
    else:
        print("→ Fetching problem list (try API)…", file=sys.stderr)
        try:
            urls = get_list_via_api()
            print(f"   → got {len(urls)} problems via API", file=sys.stderr)
        except Exception as e:
            print(f"   ✗ API failed ({e}), falling back to scrape page 1…", file=sys.stderr)
            urls = get_list_via_scrape()
            print(f"   → got {len(urls)} problems from first page", file=sys.stderr)
        chosen = random.choice(urls)
        print(f"\n→ Selected: {chosen}\n", file=sys.stderr)

    try:
        data = parse_codeforces_problem(chosen)
        # Print only the first test case if available
        first_test = data['tests'][0] if data.get('tests') and len(data['tests']) > 0 else None
        if first_test:
            print(json.dumps(first_test, ensure_ascii=False, indent=2))
        else:
            print(json.dumps({'error': 'No sample test found'}, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
