import urllib.request
import json

doi = "10.1145/3639476.3639763"
url = f"https://api.crossref.org/works/{doi}"
headers = {"User-Agent": "AcademicResearch/1.0 (mailto:happy@research.local)"}
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))["message"]
        print("Title:", data.get("title", [""])[0])
        print("Authors:", [a.get("family") for a in data.get("author", [])])
        print("Venue:", data.get("container-title", [""])[0])
        print("Issued:", data.get("issued", {}).get("date-parts"))
except Exception as e:
    print("Error:", e)
