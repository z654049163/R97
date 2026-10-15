import urllib.request
import json
import urllib.parse
import os

doi = "10.1109/tse.2023.3267848"
print(f"Checking Open Access status via Unpaywall for DOI: {doi}")

url = f"https://api.unpaywall.org/v2/{doi}?email=research@academic.org"
headers = {"User-Agent": "AcademicResearch/1.0"}

try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        is_oa = data.get("is_oa")
        best_oa = data.get("best_oa_location")
        print(f"Is Open Access: {is_oa}")
        if best_oa:
            print("Best OA PDF URL:", best_oa.get("url_for_pdf"))
            print("Landing Page:", best_oa.get("url"))
        oa_locations = data.get("oa_locations", [])
        print(f"Found {len(oa_locations)} OA locations:")
        for loc in oa_locations:
            print("  - Host:", loc.get("host_type"), "| PDF:", loc.get("url_for_pdf"), "| URL:", loc.get("url"))
except Exception as e:
    print("Error querying Unpaywall:", e)
