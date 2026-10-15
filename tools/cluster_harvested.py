import json
import re

def analyze_harvested():
    with open("datasets/literature-pool/harvested-papers-2024-2026.json", "r", encoding="utf-8") as f:
        papers = json.load(f)
        
    print(f"Total harvested 2024-2026 papers: {len(papers)}")
    
    # 统计年份
    by_year = {}
    for p in papers:
        y = p["year"]
        by_year[y] = by_year.get(y, 0) + 1
    print("Year distribution:", by_year)
    
    # 分类聚类
    clusters = {
        "C1_Deobfuscation_AST_Folding": [], # JavaScript 反混淆、常量折叠与 AST 变换
        "C2_MiniApp_CrossRuntime_Mobile": [], # 小程序、跨端/混合应用与多宿主
        "C3_LLM_Deobfus_CodeAnalysis": [], # LLM 代码逆向、大模型反混淆与理解
        "C4_Sandbox_Evasion_Fingerprint": [], # 沙箱逃逸、环境探测与指纹规避
        "C5_Compiler_Optimization_Testing": [], # 编译器优化、死代码消除与程序分析基石
        "C6_General_Software_Security": [] # 其他相关二三线论文
    }
    
    for p in papers:
        t = p["title"].lower()
        if any(w in t for w in ["deobfuscat", "obfuscat", "constant fold", "ast ", "syntax tree", "uglify", "webcrack"]):
            if "llm" in t or "large language model" in t or "gpt" in t:
                clusters["C3_LLM_Deobfus_CodeAnalysis"].append(p)
            else:
                clusters["C1_Deobfuscation_AST_Folding"].append(p)
        elif any(w in t for w in ["mini-program", "miniapp", "mini-app", "wechat", "hybrid app", "cross-platform", "cross-runtime", "runtime gap"]):
            clusters["C2_MiniApp_CrossRuntime_Mobile"].append(p)
        elif any(w in t for w in ["llm", "large language model", "neural", "deep learning", "transformer"]):
            clusters["C3_LLM_Deobfus_CodeAnalysis"].append(p)
        elif any(w in t for w in ["fingerprint", "evasion", "sandbox", "sniffing", "execution", "detection", "malicious"]):
            clusters["C4_Sandbox_Evasion_Fingerprint"].append(p)
        elif any(w in t for w in ["compiler", "optimization", "dead code", "simplification", "translation validation", "refactor"]):
            clusters["C5_Compiler_Optimization_Testing"].append(p)
        else:
            clusters["C6_General_Software_Security"].append(p)
            
    print("\nCluster counts:")
    for c, items in clusters.items():
        print(f"  {c}: {len(items)} papers")
        
    with open("datasets/literature-pool/clustered-analysis-2024-2026.json", "w", encoding="utf-8") as f:
        json.dump(clusters, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    analyze_harvested()
