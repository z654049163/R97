import urllib.request
import json
import urllib.parse

def search_arxiv(query):
    encoded = urllib.parse.quote(query)
    url = f"http://export.arxiv.org/api/query?search_query={encoded}&start=0&max_results=3"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AcademicResearch/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode('utf-8')
            print("ArXiv Response length:", len(content))
            import xml.etree.ElementTree as ET
            root = ET.fromstring(content)
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            for entry in root.findall('atom:entry', ns):
                title = entry.find('atom:title', ns).text.strip()
                id_url = entry.find('atom:id', ns).text.strip()
                print(f"Title: {title}\nURL: {id_url}\n")
    except Exception as e:
        print("ArXiv error:", e)

search_arxiv("Dead Code Elimination Can Delete Live Code")
