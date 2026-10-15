import urllib.request
import os

pdf_url = "https://arxiv.org/pdf/2308.16729"
dest = r"E:\读论文\R97\papers\TSE_2023_JavaScript_Dead_Code_Elimination.pdf"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

print("Downloading IEEE TSE 2023 official OA version from:", pdf_url)
try:
    req = urllib.request.Request(pdf_url, headers=headers)
    with urllib.request.urlopen(req, timeout=35) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    size = os.path.getsize(dest)
    print("Success! File saved to:", dest)
    print("File size:", size, "bytes")
except Exception as e:
    print("Download failed:", e)
