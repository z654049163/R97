import urllib.request
import os

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

papers = [
    {
        "id": "FV8_USENIX_2024",
        "title": "FV8: A Forced Execution JavaScript Engine for Detecting Evasive Techniques",
        "url": "https://arxiv.org/pdf/2405.13175",
        "dest": "FV8_USENIX_Security_2024.pdf"
    },
    {
        "id": "OBsmith_OOPSLA_2026",
        "title": "OBsmith: LLM-Powered JavaScript Obfuscator Testing",
        "url": "https://arxiv.org/pdf/2510.10066",
        "dest": "OBsmith_OOPSLA_2026.pdf"
    },
    {
        "id": "CASCADE_ICSE_2026",
        "title": "CASCADE: LLM-powered JavaScript Deobfuscator at Google",
        "url": "https://arxiv.org/pdf/2507.17691",
        "dest": "CASCADE_ICSE_2026.pdf"
    }
]

out_dir = r"E:\读论文\R97\papers"
os.makedirs(out_dir, exist_ok=True)

for p in papers:
    dest_path = os.path.join(out_dir, p["dest"])
    p_id = p["id"]
    p_url = p["url"]
    print("Downloading " + p_id + " from " + p_url)
    try:
        req = urllib.request.Request(p_url, headers=headers)
        with urllib.request.urlopen(req, timeout=40) as response, open(dest_path, "wb") as out_file:
            out_file.write(response.read())
        size = os.path.getsize(dest_path)
        print("Success: " + p["dest"] + " (" + str(size) + " bytes)")
    except Exception as e:
        print("Failed " + p_id + ": " + str(e))
