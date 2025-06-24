#!/usr/bin/env python3
# random_cf_sample.py

import requests
import random
from bs4 import BeautifulSoup
import sys

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
        print("→ Fetching problem list (try API)…")
        try:
            urls = get_list_via_api()
            print(f"   → got {len(urls)} problems via API")
        except Exception as e:
            print(f"   ✗ API failed ({e}), falling back to scrape page 1…")
            urls = get_list_via_scrape()
            print(f"   → got {len(urls)} problems from first page")
        chosen = random.choice(urls)
        print(f"\n→ Selected: {chosen}\n")

    sample_in, sample_out = scrape_first_sample(chosen)
    if sample_in is None or sample_out is None:
        print("⚠️  No sample test found on that problem.")
    else:
        print("=== First Sample Input ===")
        print(sample_in)
        print("\n=== First Sample Output ===")
        print(sample_out)

if __name__ == "__main__":
    main()
