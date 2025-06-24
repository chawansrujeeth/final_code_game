import http.server
import json
import threading

PORT = 27121  # Default port for Competitive Companion

class CompetitiveCompanionHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        try:
            data = json.loads(post_data.decode('utf-8'))
            print("Received problem data from Competitive Companion:")
            print(json.dumps(data, indent=2))
            # You can save or process the data here, e.g., write to a file or update your duel UI
            with open('last_problem.json', 'w') as f:
                json.dump(data, f, indent=2)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'OK')
        except Exception as e:
            print(f"Error: {e}")
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Error')

if __name__ == "__main__":
    server = http.server.HTTPServer(('localhost', PORT), CompetitiveCompanionHandler)
    print(f"Competitive Companion server listening on http://localhost:{PORT}/")
    print("Click the extension on a problem page to send data here.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
