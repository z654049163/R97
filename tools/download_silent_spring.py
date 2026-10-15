import urllib.request
import os

url = "https://arxiv.org/pdf/2207.11171"
dest = r"E:\读论文\R97\papers\Silent_Spring_USENIX_Security_2023_Distinguished.pdf"
headers = {"User-Agent": "Mozilla/5.0"}

print("Downloading Silent Spring from", url)
try:
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as resp:
        content = resp.read()
        with open(dest, "wb") as f:
            f.write(content)
        print("Success! Size:", len(content))
except Exception as e:
    print("Failed:", e)
