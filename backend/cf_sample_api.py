from flask import Flask, request, jsonify
import requests
from bs4 import BeautifulSoup
import subprocess
import sys

app = Flask(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/115.0.0.0 Safari/537.36"
    )
}

def scrape_first_sample(problem_url):
    try:
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
    except Exception as e:
        return None, None

@app.route('/get-sample', methods=['GET'])
def get_sample():
    url = request.args.get('url')
    if not url:
        return jsonify({"error": "Missing problem URL"}), 400
    sample_in, sample_out = scrape_first_sample(url)
    return jsonify({
        "input": sample_in,
        "output": sample_out
    })

@app.route('/get-sample-random', methods=['GET'])
def get_sample_random():
    url = request.args.get('url')
    print(f'[DEBUG] /get-sample-random called with url: {url}', flush=True)
    if not url:
        print('[DEBUG] Missing problem URL', flush=True)
        return jsonify({"error": "Missing problem URL"}), 400
    try:
        cmd = [sys.executable, 'random_cf_sample.py', url]
        print(f'[DEBUG] Running command: {cmd}', flush=True)
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='.')
        print(f'[DEBUG] Subprocess returncode: {result.returncode}', flush=True)
        print(f'[DEBUG] Subprocess stdout: {result.stdout}', flush=True)
        print(f'[DEBUG] Subprocess stderr: {result.stderr}', flush=True)
        if result.returncode != 0:
            return jsonify({"error": result.stderr.strip() or 'Failed to run random_cf_sample.py'}), 500
        # Output is JSON
        return result.stdout, 200, {'Content-Type': 'application/json'}
    except Exception as e:
        print(f'[DEBUG] Exception in /get-sample-random: {e}', flush=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
