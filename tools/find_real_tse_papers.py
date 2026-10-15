import urllib.request
import json
import urllib.parse

def search_venues(queries):
    headers = {"User-Agent": "AcademicResearch/1.0 (mailto:happy@research.local)"}
    for q in queries:
        encoded = urllib.parse.quote(q)
        url = f"https://api.crossref.org/works?query={encoded}&filter=from-pub-date:2024-01-01&rows=5"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                items = data.get("message", {}).get("items", [])
                print(f"=== Query: {q} ===")
                for it in items:
                    title = it.get("title", [""])[0]
                    doi = it.get("DOI", "")
                    container = it.get("container-title", [""])[0]
                    year = it.get("issued", {}).get("date-parts", [[None]])[0][0]
                    print(f"  Title: {title}\n  Venue: {container} ({year})\n  DOI: {doi}\n")
        except Exception as e:
            print(f"Error {q}: {e}")

search_venues([
    "JavaScript dead code elimination TSE",
    "JavaScript environment-specific IEEE Transactions on Software Engineering",
    "JavaScript cross-runtime ICSE 2024",
    "JavaScript obfuscation constant folding TOSEM 2024"
])
