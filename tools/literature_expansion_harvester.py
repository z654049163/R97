import urllib.request
import urllib.parse
import json
import time
import os
import sys

# 设定查询关键词主题群组（面向 2024-2026 年）
# 覆盖一线顶会顶刊，同时全面覆盖二三线会议（如 SCAM, SANER, ICPC, SAC, DIMVA, ACSAC, EuroS&P, AsiaCCS, DependSys, TrustCom, COMPSAC 等）与通用预印本
QUERIES = [
    # 1. JavaScript 反混淆与常量折叠
    {"query": "JavaScript deobfuscation constant folding", "from_year": 2024},
    {"query": "JavaScript obfuscation reverse engineering AST", "from_year": 2024},
    {"query": "JavaScript minification dead code elimination", "from_year": 2024},
    {"query": "deobfuscate JavaScript LLM webcrack", "from_year": 2024},
    {"query": "code deobfuscation abstract interpretation", "from_year": 2024},
    
    # 2. 小程序与跨环境分析
    {"query": "WeChat mini-program security analysis", "from_year": 2024},
    {"query": "mini-app JavaScript taint analysis", "from_year": 2024},
    {"query": "cross-platform JavaScript runtime inconsistency", "from_year": 2024},
    {"query": "hybrid application JavaScript bridge analysis", "from_year": 2024},
    {"query": "Node.js browser compatibility runtime gap", "from_year": 2024},
    
    # 3. 环境嗅探、指纹逃逸与沙箱规避
    {"query": "JavaScript environment sniffing evasion", "from_year": 2024},
    {"query": "browser fingerprinting evasion JavaScript sandbox", "from_year": 2024},
    {"query": "forced execution JavaScript web analysis", "from_year": 2024},
    {"query": "JavaScript dynamic analysis multi-runtime", "from_year": 2024},
    
    # 4. 代码简化、程序等价性与语义保持
    {"query": "JavaScript program simplification semantics preserving", "from_year": 2024},
    {"query": "JavaScript translation validation compiler optimization", "from_year": 2024},
    {"query": "JavaScript AST refactoring static analysis", "from_year": 2024},
    {"query": "JavaScript code clone deobfuscation benchmark", "from_year": 2024},
]

def query_crossref(query_text, from_year=2024, rows=15):
    encoded_query = urllib.parse.quote_plus(query_text)
    url = f"https://api.crossref.org/works?query={encoded_query}&filter=from-pub-date:{from_year}-01-01&rows={rows}&sort=relevance"
    headers = {
        "User-Agent": "R97AcademicResearchDossier/2.0 (mailto:academic-research@r97-project.org)"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            items = data.get("message", {}).get("items", [])
            results = []
            for item in items:
                title = item.get("title", [""])[0] if item.get("title") else ""
                doi = item.get("DOI", "")
                venue = item.get("container-title", [""])[0] if item.get("container-title") else ""
                if not venue and item.get("publisher"):
                    venue = item.get("publisher")
                published = item.get("published-print", {}) or item.get("published-online", {}) or item.get("created", {})
                year = None
                date_parts = published.get("date-parts", [[]])[0]
                if date_parts:
                    year = date_parts[0]
                authors_list = item.get("author", [])
                authors = []
                for a in authors_list:
                    given = a.get("given", "")
                    family = a.get("family", "")
                    authors.append(f"{given} {family}".strip())
                
                if title and doi and year and year >= 2024:
                    results.append({
                        "title": title,
                        "doi": doi,
                        "venue": venue,
                        "year": year,
                        "authors": authors[:5], # 最多前5人
                        "type": item.get("type", "article")
                    })
            return results
    except Exception as e:
        print(f"Error querying CrossRef for '{query_text}': {e}", file=sys.stderr)
        return []

def query_arxiv(query_text, max_results=20):
    encoded_query = urllib.parse.quote_plus(query_text)
    url = f"http://export.arxiv.org/api/query?search_query=all:{encoded_query}&start=0&max_results={max_results}&sortBy=submittedDate&sortOrder=descending"
    headers = {
        "User-Agent": "R97AcademicResearchDossier/2.0"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            xml_text = resp.read().decode('utf-8')
            # 简易解析 XML entry
            import xml.etree.ElementTree as ET
            root = ET.fromstring(xml_text)
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            results = []
            for entry in root.findall('atom:entry', ns):
                title = entry.find('atom:title', ns).text.strip().replace('\n', ' ')
                id_url = entry.find('atom:id', ns).text.strip()
                published = entry.find('atom:published', ns).text.strip()
                year = int(published[:4])
                authors = [a.find('atom:name', ns).text.strip() for a in entry.findall('atom:author', ns)]
                if year >= 2024:
                    results.append({
                        "title": title,
                        "doi": id_url,
                        "venue": "arXiv preprint",
                        "year": year,
                        "authors": authors[:5],
                        "type": "preprint"
                    })
            return results
    except Exception as e:
        print(f"Error querying arXiv for '{query_text}': {e}", file=sys.stderr)
        return []

def main():
    seen_dois = set()
    all_papers = []
    
    print("Starting comprehensive multi-source harvesting for 2024-2026 papers...")
    
    for q in QUERIES:
        print(f"Querying CrossRef: {q['query']} (from {q['from_year']})...")
        cr_res = query_crossref(q["query"], q["from_year"], rows=20)
        for p in cr_res:
            d_norm = p["doi"].lower().strip()
            if d_norm not in seen_dois:
                seen_dois.add(d_norm)
                all_papers.append(p)
        time.sleep(1) # 尊重速率限制
        
        # 针对重点词查询 arXiv
        print(f"Querying arXiv: {q['query']}...")
        ar_res = query_arxiv(q["query"], max_results=15)
        for p in ar_res:
            d_norm = p["doi"].lower().strip()
            if d_norm not in seen_dois:
                seen_dois.add(d_norm)
                all_papers.append(p)
        time.sleep(1)
        
        print(f"Current unique papers harvested: {len(all_papers)}")
        if len(all_papers) >= 150:
            print("Reached target pool size (150+ papers).")
            break

    os.makedirs("datasets/literature-pool", exist_ok=True)
    out_file = "datasets/literature-pool/harvested-papers-2024-2026.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(all_papers, f, ensure_ascii=False, indent=2)
    
    print(f"Successfully harvested {len(all_papers)} unique 2024-2026 papers into {out_file}")

if __name__ == "__main__":
    main()
