import urllib.request
import json
import urllib.parse

def search_arxiv_top(query):
    encoded = urllib.parse.quote(query)
    url = f"http://export.arxiv.org/api/query?search_query={encoded}&start=0&max_results=5"
    headers = {"User-Agent": "AcademicResearch/1.0"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode('utf-8')
            import xml.etree.ElementTree as ET
            root = ET.fromstring(content)
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            print(f"=== Results for: {query} ===")
            for entry in root.findall('atom:entry', ns):
                title = entry.find('atom:title', ns).text.strip().replace('\n', ' ')
                id_url = entry.find('atom:id', ns).text.strip()
                summary = entry.find('atom:summary', ns).text.strip().replace('\n', ' ')[:150]
                comment = entry.find('{http://arxiv.org/xmlns/arxiv}comment')
                comment_text = comment.text if comment is not None else ""
                print(f"Title: {title}\nURL: {id_url}\nComment: {comment_text}\nSummary: {summary}...\n")
    except Exception as e:
        print("Error:", e)

search_arxiv_top("JavaScript Translation Validation ICSE")
search_arxiv_top("JavaScript Dead Code ICSE")
