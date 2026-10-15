import urllib.request
import os

url = "https://dl.acm.org/doi/pdf/10.1145/3639476.3639763"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
req = urllib.request.Request(url, headers=headers)
dest = r"E:\读论文\R97\papers\ICSE_2024_Dead_Code_Elimination_Can_Delete_Live_Code.pdf"

try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read()
        print("Downloaded length:", len(content))
        with open(dest, "wb") as f:
            f.write(content)
        print("Saved to", dest)
except Exception as e:
    print("Download failed:", e)
