# -*- coding: utf-8 -*-
"""提取中文版PDF的所有高亮注释(页码、文本、颜色、位置)"""
import pymupdf
import json

SRC = r"E:\桌面\论文文件\OBsmith 1.pdf"
doc = pymupdf.open(SRC)
out = []
for pno in range(len(doc)):
    page = doc[pno]
    annots = list(page.annots() or [])
    for annot in annots:
        if annot.type[0] != pymupdf.PDF_ANNOT_HIGHLIGHT:
            continue
        # 高亮可能由多个 quad 组成,逐 quad 取文本
        verts = annot.vertices
        quads = []
        if verts:
            for i in range(0, len(verts), 4):
                r = pymupdf.Quad(verts[i:i+4]).rect
                quads.append(r)
        else:
            quads = [annot.rect]
        texts = []
        for r in quads:
            r = r + (-1, -1, 1, 1)  # 略扩边界
            t = page.get_text("text", clip=r)
            texts.append(t.strip())
        full = " ".join(x for x in texts if x)
        out.append({
            "page": pno + 1,
            "color": [round(c, 3) for c in annot.colors.get("stroke", [])],
            "text": full,
        })
        # 打印 quad 位置备用
        print(f"--- P{pno+1} color={out[-1]['color']}")
        print(full.replace("\n", " "))
doc.close()
with open(r"E:\读论文\R97\tmp_pdf_work\zh_highlights.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(f"\nTOTAL: {len(out)} highlights")
