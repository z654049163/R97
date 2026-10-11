# R97 论文 LaTeX 工程

**文件结构**

```
paper/latex/
├── main.tex      # 论文全文（acmart sigconf 双栏，nonacm 预印本样式）
├── refs.bib      # 15 条参考文献（全部经网络核实）
└── figures/
    └── r97_horizontal_framework.pdf   # Figure 1 素材（可用可不用）
```

**本机编译（已装 TinyTeX 时）**

```bash
cd paper/latex
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

**Overleaf 编译（推荐，零配置）**

1. 新建项目 → Upload Project，上传本目录三个文件（ figures/ 一并打包 zip）；
2. 编译器选 pdfLaTeX，主文档 main.tex；
3. acmart 是 TeX Live 自带类，无需额外配置。

**换投 USENIX Security 时**

把导言区的 `\documentclass[sigconf,nonacm]{acmart}` 换为：

```latex
\documentclass[letterpaper,twocolumn,10pt]{article}
\usepackage{usenix-2020-07}   % 从 usenix.org 模板包获取
```

并把 `\maketitle` 移到 abstract 之后、按 USENIX 惯例调整节标题大小写即可，正文无需改动。

**中文摘要**：单独保存在 `../R97_CCF-A_paper.md` 尾部（CCF-A 提交为纯英文，中文摘要仅供课题内部使用，故不进 main.tex 以免引入 CJK 编译依赖）。
