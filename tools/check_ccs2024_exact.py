import urllib.request
import json
import urllib.parse

doi = "10.1145/3658644.3670356" # CCS 2024
encoded_doi = urllib.parse.quote(doi)
url = f"https://api.crossref.org/works/{doi}"
headers = {"User-Agent": "AcademicResearch/1.0"}

try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))["message"]
        print("Title:", data.get("title", [""])[0])
        print("Container:", data.get("container-title", [""])[0])
        print("Issued:", data.get("issued"))
except Exception as e:
    print("Error:", e)
