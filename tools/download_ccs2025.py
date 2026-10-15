import urllib.request
import os

url = "https://arxiv.org/pdf/2506.20170"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
req = urllib.request.Request(url, headers=headers)
dest = r"E:\读论文\R97\papers\JsDeObsBench_ACM_CCS_2025.pdf"

try:
    print("Downloading JsDeObsBench from", url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read()
        print("Downloaded length:", len(content))
        with open(dest, "wb") as f:
            f.write(content)
        print("Saved to", dest)
except Exception as e:
    print("Download failed:", e)
