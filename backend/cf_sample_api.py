from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import subprocess
import sys
from supabase import create_client, Client
import os

app = Flask(__name__)
CORS(app)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/115.0.0.0 Safari/537.36"
    )
}

# Initialize Supabase client
SUPABASE_URL = os.environ.get("REACT_APP_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("REACT_APP_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Store latest samples by problem URL
latest_samples_by_url = {}

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
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd='.', timeout=20)
        except subprocess.TimeoutExpired:
            print('[DEBUG] Subprocess timed out', flush=True)
            return jsonify({"error": "random_cf_sample.py timed out"}), 504
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

@app.route('/api/receive-samples', methods=['POST'])
def receive_samples():
    data = request.get_json()
    samples = data.get('samples')
    url = data.get('url')
    if not url or not samples:
        return jsonify({'error': 'Missing url or samples'}), 400
    # Save to Supabase (upsert)
    res = supabase.table("cf_problems").upsert({
        "problem_url": url,
        "samples": samples
    }, on_conflict="problem_url").execute()
    return jsonify({'status': 'ok', 'url': url, 'data': res.data})

@app.route('/api/get-samples', methods=['GET'])
def get_samples():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'Missing url'}), 400
    # Fetch from Supabase
    res = supabase.table("cf_problems").select("*").eq("problem_url", url).execute()
    if not res.data or len(res.data) == 0:
        return jsonify({'error': 'No samples found for this url'}), 404
    samples = res.data[0]['samples']
    return jsonify({'samples': samples, 'url': url})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5051))
    app.run(host='0.0.0.0', port=port)
