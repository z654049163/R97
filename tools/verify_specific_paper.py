import urllib.request
import json
import urllib.parse

def search_crossref(query):
    encoded = urllib.parse.quote(query)
    url = f"https://api.crossref.org/works?query={encoded}&rows=5"
    headers = {"User-Agent": "AcademicResearch/1.0 (mailto:happy@research.local)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            items = data.get("message", {}).get("items", [])
            print(f"Query: {query}")
            for it in items:
                title = it.get("title", [""])[0]
                doi = it.get("DOI", "")
                container = it.get("container-title", [""])[0]
                year = it.get("issued", {}).get("date-parts", [[None]])[0][0]
                print(f"  -> Title: {title} | Year: {year} | Venue: {container} | DOI: {doi}")
    except Exception as e:
        print(f"Error querying {query}: {e}")

search_crossref("Characterizing and Mitigating Environment-Specific Flaws in Modern JavaScript Ecosystems")
search_crossref("Environment-Specific Flaws Modern JavaScript")
