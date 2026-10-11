# -*- coding: utf-8 -*-
"""在英文版 PDF 上按映射表添加高亮(与中文版同色)"""
import sys, re
sys.stdout.reconfigure(encoding="utf-8")
import pymupdf
sys.path.insert(0, r"E:\读论文\R97\tmp_pdf_work")
from highlight_mapping import MAPPING

SRC = r"E:\桌面\论文文件\OBsmith.pdf"
OUT = r"E:\桌面\论文文件\OBsmith_高亮版.pdf"
HL = (0.953, 0.961, 0.024)  # 与中文版高亮相同的黄色

def candidates(text):
    """生成候选搜索串: 原文 + 引号/撇号变体(直<->弯) + 截短变体"""
    out = [text]
    q = text.replace("\u201c", '"').replace("\u201d", '"').replace("\u2019", "'").replace("\u2018", "'")
    if q != text:
        out.append(q)
    q = text.replace("'", "\u2019")          # 直撇号 -> 弯撇号 (PDF 常用弯撇号)
    if q not in out:
        out.append(q)
    q = text.replace('"', '\u201c')          # 直引号 -> 弯引号
    if q not in out:
        out.append(q)
    # 截短: 按词从尾部收缩
    words = text.split()
    for frac in (0.85, 0.7, 0.55, 0.4):
        n = max(2, int(len(words) * frac))
        v = " ".join(words[:n])
        if v not in out:
            out.append(v)
    return out

def find(page, text):
    for cand in candidates(text):
        try:
            quads = page.search_for(cand, quads=True, flags=pymupdf.TEXT_DEHYPHENATE)
        except Exception:
            quads = page.search_for(cand, quads=True)
        if quads:
            return quads, cand
    return None, text

doc = pymupdf.open(SRC)
ok, fail = 0, []
total_quads = 0
for pno, spec in MAPPING:
    page = doc[pno - 1]
    parts = spec if isinstance(spec, list) else [spec]
    all_quads, bad = [], None
    for part in parts:
        quads, used = find(page, part)
        if not quads:
            bad = part
            break
        all_quads.extend(quads)
    if bad is not None:
        fail.append((pno, bad))
        continue
    annot = page.add_highlight_annot(all_quads)
    annot.set_colors(stroke=HL)
    annot.update()
    ok += 1
    total_quads += len(all_quads)
    if isinstance(spec, list):
        print(f"[片段] P{pno}: {len(parts)} 个片段命中")

doc.save(OUT, garbage=1, deflate=True)
doc.close()
print(f"\n完成: {ok}/{len(MAPPING)} 条命中, 共 {total_quads} 个高亮矩形")
if fail:
    print(f"\n未命中 {len(fail)} 条:")
    for pno, text in fail:
        print(f"  P{pno}: {text[:90]}")
