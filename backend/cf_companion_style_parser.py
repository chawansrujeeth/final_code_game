import requests
from bs4 import BeautifulSoup
import re

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/115.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://codeforces.com/",
}

def parse_codeforces_problem(url):
    session = requests.Session()
    session.headers.update(HEADERS)
    resp = session.get(url, timeout=10)
    resp.raise_for_status()
    html = resp.text
    soup = BeautifulSoup(html, 'html.parser')

    # Problem name
    name_elem = soup.select_one('.problem-statement > .header > .title')
    name = name_elem.text.strip() if name_elem else None

    # Category (contest/round)
    category = None
    if '/edu/' in url:
        breadcrumbs = [a.text.strip() for a in soup.select('.eduBreadcrumb > a')]
        if breadcrumbs:
            breadcrumbs.pop()
            category = ' - '.join(breadcrumbs)
    else:
        contest_type = 'gym' if '/gym/' in url else 'contest'
        title_elem = soup.select_one(f'.rtable > tbody > tr > th > a[href*={contest_type}]')
        if title_elem:
            category = title_elem.text.strip()

    # Interactive
    interactive_keywords = ['Interaction', 'Протокол взаимодействия']
    is_interactive = any(
        s.text in interactive_keywords for s in soup.select('.section-title')
    )

    # Time/memory limits (robust extraction)
    def extract_limit(selector, is_time=True):
        node = soup.select_one(selector)
        if node:
            text = node.text
            # Use regex to find the first number (float for time, int for memory)
            match = re.search(r"([0-9]+(?:\.[0-9]+)?)", text)
            if match:
                return float(match.group(1)) * 1000 if is_time else int(match.group(1))
        return None

    time_limit = extract_limit('.problem-statement > .header > .time-limit', is_time=True)
    memory_limit = extract_limit('.problem-statement > .header > .memory-limit', is_time=False)

    # Input/output files (usually stdin/stdout)
    input_file_node = soup.select_one('.problem-statement > .header > .input-file')
    input_file = input_file_node.text.strip() if input_file_node else None
    output_file_node = soup.select_one('.problem-statement > .header > .output-file')
    output_file = output_file_node.text.strip() if output_file_node else None

    # Sample tests
    inputs = soup.select('.input pre')
    outputs = soup.select('.output pre')
    tests = []
    for inp, out in zip(inputs, outputs):
        # Clean up HTML <br> to newlines
        def get_text(pre):
            return ''.join(str(x) if isinstance(x, str) else '\n' for x in pre.contents).replace('\r', '').strip() + '\n'
        tests.append({
            'input': get_text(inp),
            'output': get_text(out)
        })

    return {
        'name': name,
        'category': category,
        'url': url,
        'interactive': is_interactive,
        'timeLimit': time_limit,
        'memoryLimit': memory_limit,
        'inputFile': input_file,
        'outputFile': output_file,
        'tests': tests
    }

# Example usage:
# data = parse_codeforces_problem('https://codeforces.com/problemset/problem/954/G')
# print(data)
