import urllib.request
import json

doi = "10.1145/3706857.3707214" # JsDeObsBench CCS 2025
url = f"https://api.crossref.org/works/{doi}"
headers = {"User-Agent": "AcademicResearch/1.0"}
try:
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))["message"]
        print("Title:", data.get("title", [""])[0])
        print("Venue:", data.get("container-title", [""])[0])
        print("Link:", data.get("link", []))
except Exception as e:
    print("Error:", e)
