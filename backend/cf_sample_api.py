from flask import Flask, request, jsonify
import requests
from bs4 import BeautifulSoup

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
