import urllib.request
import os

papers = [
    {
        "id": "Mini-Programs_Mega-Problems_CCS_2024",
        "url": "https://arxiv.org/pdf/2407.08232", # arXiv 2407.08232 (typo in file was 2607)
        "dest": "Mini_Programs_Mega_Problems_ACM_CCS_2024.pdf"
    },
    {
        "id": "Dont_Leak_Your_Keys_CCS_2023",
        "url": "https://arxiv.org/pdf/2306.08151",
        "dest": "Dont_Leak_Your_Keys_ACM_CCS_2023.pdf"
    }
]

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
out_dir = r"E:\读论文\R97\papers"

for p in papers:
    dest_path = os.path.join(out_dir, p["dest"])
    print(f"Downloading {p['id']} from {p['url']}...")
    try:
        req = urllib.request.Request(p["url"], headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp, open(dest_path, "wb") as f:
            f.write(resp.read())
        size = os.path.getsize(dest_path)
        print(f"Success: {p['dest']} ({size} bytes)")
    except Exception as e:
        print(f"Failed {p['id']}: {e}")
