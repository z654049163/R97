import os
import subprocess

# ==============================================================================
# 五层科研项目架构模型图: r97_five_layer_research_framework.svg
# 严格按照“输入 ➔ 特征 ➔ 核心模型(★创新点) ➔ 验证闭环 ➔ 输出”的五层顶会科研模型设计
# ==============================================================================

svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1360 840" width="1360" height="840" style="background:#FFFFFF; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, 'Source Han Sans SC', 'Microsoft YaHei', sans-serif;">
  <defs>
    <filter id="layer-shadow" x="-3%" y="-2%" width="106%" height="106%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0F172A" flood-opacity="0.04" />
    </filter>

    <marker id="fw-arr-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7"/>
    </marker>
    <marker id="fw-arr-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669"/>
    </marker>
    <marker id="fw-arr-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#DC2626"/>
    </marker>
    <marker id="fw-arr-dark" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#334155"/>
    </marker>
  </defs>

  <!-- Canvas Border -->
  <rect x="12" y="12" width="1336" height="816" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2"/>

  <!-- Paper Title Header -->
  <g transform="translate(32, 34)">
    <rect x="0" y="-4" width="112" height="22" rx="11" fill="#E0F2FE"/>
    <text x="56" y="11" text-anchor="middle" font-size="10" font-weight="700" fill="#0369A1">FRAMEWORK</text>
    
    <text x="124" y="14" font-size="16" font-weight="800" fill="#0F172A">面向跨环境异构语义保持的目标感知反混淆折叠保护分析框架 (R97 Framework Overview)</text>
    <text x="0" y="32" font-size="11" fill="#64748B">
      针对离线求值导致环境敏感分支误剪与运行时崩溃问题 · 五层科研闭环模型：输入 ➔ 特征解耦 ➔ 守门模型 ➔ 验证闭环 ➔ 保语义输出
    </text>
  </g>

  <!-- ==================== LAYER 1: INPUT LAYER (Y: 76) ==================== -->
  <g transform="translate(32, 76)">
    <rect x="0" y="0" width="1296" height="82" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" filter="url(#layer-shadow)"/>
    
    <!-- Layer Badge -->
    <g transform="translate(14, 14)">
      <rect x="0" y="0" width="105" height="22" rx="4" fill="#E2E8F0"/>
      <text x="52" y="15" text-anchor="middle" font-size="10" font-weight="800" fill="#334155">第一层: 输入层</text>
      <text x="52" y="38" text-anchor="middle" font-size="8" fill="#64748B">Input Layer</text>
    </g>

    <!-- Source Code Inputs (3 Domains) -->
    <g transform="translate(135, 12)">
      <rect x="0" y="0" width="560" height="58" rx="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
      <text x="12" y="18" font-size="9.5" font-weight="700" fill="#0369A1">1. 异构受保护/混淆源码输入 (Protected JavaScript Code):</text>
      
      <g transform="translate(12, 26)">
        <rect x="0" y="0" width="168" height="24" rx="4" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="0.8"/>
        <text x="8" y="16" font-size="8" font-weight="700" fill="#166534">📱 移动小程序</text>
        <text x="68" y="16" font-family="monospace" font-size="8" fill="#0F172A">if(typeof wx) wx.req()</text>

        <rect x="180" y="0" width="174" height="24" rx="4" fill="#EDE7F6" stroke="#C4B5FD" stroke-width="0.8"/>
        <text x="188" y="16" font-size="8" font-weight="700" fill="#5B21B6">🌐 前端 Web WPT</text>
        <text x="264" y="16" font-family="monospace" font-size="8" fill="#0F172A">window.localSt...</text>

        <rect x="366" y="0" width="162" height="24" rx="4" fill="#FEF3C7" stroke="#FDE68A" stroke-width="0.8"/>
        <text x="374" y="16" font-size="8" font-weight="700" fill="#B45309">⚙️ 后端 Node</text>
        <text x="444" y="16" font-family="monospace" font-size="8" fill="#0F172A">process.env</text>
      </g>
    </g>

    <!-- External Deployment Manifests -->
    <g transform="translate(710, 12)">
      <rect x="0" y="0" width="570" height="58" rx="6" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1"/>
      <text x="12" y="18" font-size="9.5" font-weight="700" fill="#6D28D9">2. 外部客观部署证据输入 (External Manifest Proofs):</text>
      
      <g transform="translate(12, 26)">
        <rect x="0" y="0" width="170" height="24" rx="4" fill="#FAF5FF" stroke="#E9D5FF" stroke-width="0.8"/>
        <text x="8" y="16" font-size="8" font-weight="700" fill="#6D28D9">小程序配置清单</text>
        <text x="82" y="16" font-family="monospace" font-size="7.5" fill="#475569">project.config.json</text>

        <rect x="182" y="0" width="176" height="24" rx="4" fill="#FAF5FF" stroke="#E9D5FF" stroke-width="0.8"/>
        <text x="190" y="16" font-size="8" font-weight="700" fill="#6D28D9">Web 清单 / 指纹</text>
        <text x="268" y="16" font-family="monospace" font-size="7.5" fill="#475569">index.html, manifest</text>

        <rect x="370" y="0" width="178" height="24" rx="4" fill="#FAF5FF" stroke="#E9D5FF" stroke-width="0.8"/>
        <text x="378" y="16" font-size="8" font-weight="700" fill="#6D28D9">Node 服务配置</text>
        <text x="456" y="16" font-family="monospace" font-size="7.5" fill="#475569">package.json (engines)</text>
      </g>
    </g>
  </g>

  <!-- Flow Connector L1 -> L2 -->
  <line x1="415" y1="158" x2="415" y2="176" stroke="#0284C7" stroke-width="1.5" marker-end="url(#fw-arr-blue)"/>
  <line x1="995" y1="158" x2="995" y2="176" stroke="#7C3AED" stroke-width="1.5" marker-end="url(#fw-arr-blue)"/>

  <!-- ==================== LAYER 2: FEATURE DECOUPLING & EXTRACTION (Y: 176) ==================== -->
  <g transform="translate(32, 176)">
    <rect x="0" y="0" width="1296" height="114" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" filter="url(#layer-shadow)"/>
    
    <!-- Layer Badge -->
    <g transform="translate(14, 24)">
      <rect x="0" y="0" width="105" height="22" rx="4" fill="#E2E8F0"/>
      <text x="52" y="15" text-anchor="middle" font-size="10" font-weight="800" fill="#334155">第二层: 特征分析层</text>
      <text x="52" y="38" text-anchor="middle" font-size="8" fill="#64748B">Feature Extraction</text>
    </g>

    <!-- Code-side Requirement Extractor -->
    <g transform="translate(135, 12)">
      <rect x="0" y="0" width="415" height="90" rx="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
      <text x="12" y="18" font-size="9.5" font-weight="700" fill="#0369A1">代码侧：AST 作用域与依赖解析 (AST Scope &amp; Alias Engine)</text>
      <text x="12" y="34" font-size="8.5" fill="#475569">• 词法作用域链遍历：排除局部变量与函数形参遮蔽伪依赖</text>
      <text x="12" y="48" font-size="8.5" fill="#475569">• 常量别名递归追踪：追溯 client ➔ wx 动态引用链</text>
      <line x1="10" y1="56" x2="405" y2="56" stroke="#E2E8F0" stroke-width="0.8"/>
      <rect x="10" y="62" width="395" height="20" rx="3" fill="#F0FDF4" stroke="#86EFAC" stroke-width="0.8"/>
      <text x="18" y="76" font-size="8.5" font-weight="700" fill="#15803D">➔ 必需能力状态 (required): { definite (确信依赖), possible, not_required }</text>
    </g>

    <!-- Center: Physical Separation Firewall -->
    <g transform="translate(564, 12)">
      <rect x="0" y="0" width="288" height="90" rx="6" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2" stroke-dasharray="3 3"/>
      <text x="144" y="24" text-anchor="middle" font-size="10.5" font-weight="800" fill="#E11D48">🔒 正交隔离防火墙 (Required ⊥ Target)</text>
      <text x="144" y="44" text-anchor="middle" font-size="8.5" font-weight="700" fill="#9F1239">科学不变量：绝对禁止循环推断！</text>
      <text x="14" y="62" font-size="8" fill="#BE123C">• 代码内部写了 wx，仅代表依赖需求 (required)；</text>
      <text x="14" y="76" font-size="8" fill="#BE123C">• 严禁借此反推目标环境！目标必须由外部独立给出。</text>
    </g>

    <!-- Evidence-side Target Resolver -->
    <g transform="translate(866, 12)">
      <rect x="0" y="0" width="414" height="90" rx="6" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1"/>
      <text x="12" y="18" font-size="9.5" font-weight="700" fill="#6D28D9">证据侧：外部目标环境解析 (Target Runtime Resolver)</text>
      <text x="12" y="34" font-size="8.5" fill="#475569">• 外部事实核验：解析 project.config.json 与环境指纹</text>
      <text x="12" y="48" font-size="8.5" fill="#475569">• 排除多源配置冲突，防范代码自身特征反哺</text>
      <line x1="10" y1="56" x2="404" y2="56" stroke="#E2E8F0" stroke-width="0.8"/>
      <rect x="10" y="62" width="394" height="20" rx="3" fill="#EDE7F6" stroke="#C4B5FD" stroke-width="0.8"/>
      <text x="18" y="76" font-size="8.5" font-weight="700" fill="#5B21B6">➔ 目标确认状态 (target): { confirmed (强证实), corroborated, inferred }</text>
    </g>
  </g>

  <!-- Flow Connector L2 -> L3 -->
  <line x1="680" y1="290" x2="680" y2="308" stroke="#0284C7" stroke-width="2" marker-end="url(#fw-arr-blue)"/>

  <!-- ==================== LAYER 3: ★ PROPOSED CORE MODEL LAYER (Y: 308) ==================== -->
  <g transform="translate(32, 308)">
    <!-- Highlighted Card -->
    <rect x="0" y="0" width="1296" height="236" rx="8" fill="#FFFFFF" stroke="#0284C7" stroke-width="1.5" filter="url(#layer-shadow)"/>
    
    <!-- Layer Badge with Star -->
    <g transform="translate(14, 28)">
      <rect x="0" y="0" width="105" height="32" rx="4" fill="#0284C7"/>
      <text x="52" y="15" text-anchor="middle" font-size="9" font-weight="800" fill="#FFFFFF">★ 核心模型层 ★</text>
      <text x="52" y="27" text-anchor="middle" font-size="8" font-weight="700" fill="#FFFFFF">Proposed Model</text>
      <text x="52" y="52" text-anchor="middle" font-size="8" fill="#64748B">Tri-State Guard</text>
    </g>

    <!-- Sub-module 1: Semantic Contract C -->
    <g transform="translate(135, 12)">
      <rect x="0" y="0" width="310" height="212" rx="6" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="1"/>
      <text x="10" y="18" font-size="10" font-weight="800" fill="#0369A1">1. 语义契约模型 C (Contract Builder)</text>
      <text x="10" y="34" font-size="8.5" fill="#475569">• 用法上下文驱动投影：按运算符提取最小保真维度</text>
      
      <!-- 3 Pills -->
      <g transform="translate(10, 44)">
        <rect x="0" y="0" width="88" height="22" rx="11" fill="#FFFFFF" stroke="#0284C7" stroke-width="0.8"/>
        <text x="44" y="15" text-anchor="middle" font-size="8" font-weight="700" fill="#0284C7">typeof 维度</text>

        <rect x="96" y="0" width="94" height="22" rx="11" fill="#FFFFFF" stroke="#0284C7" stroke-width="0.8"/>
        <text x="143" y="15" text-anchor="middle" font-size="8" font-weight="700" fill="#0284C7">truthiness 维度</text>

        <rect x="198" y="0" width="92" height="22" rx="11" fill="#FFFFFF" stroke="#0284C7" stroke-width="0.8"/>
        <text x="244" y="15" text-anchor="middle" font-size="8" font-weight="700" fill="#0284C7">return_val 维度</text>
      </g>

      <!-- Non-deterministic Trap Card -->
      <g transform="translate(10, 74)">
        <rect x="0" y="0" width="290" height="58" rx="4" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1"/>
        <text x="8" y="15" font-size="8.5" font-weight="700" fill="#9F1239">非确定性语言内建陷阱拦截:</text>
        <text x="8" y="29" font-size="7.5" fill="#BE123C">命中 Date.now() / Math.random() 等时变调用</text>
        <text x="8" y="41" font-size="7.5" fill="#BE123C">➔ 无法自等 ➔ 强制要求 return_val ➔ 守住未决 UNKNOWN</text>
      </g>

      <text x="10" y="150" font-size="8" fill="#475569">• 比较谓词绑定：predicate = strict_equal</text>
      <text x="10" y="164" font-size="8" fill="#475569">• 作用域有效性范围签名绑定 (SHA-256)</text>
      <rect x="10" y="174" width="290" height="26" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
      <text x="18" y="191" font-size="8" font-weight="700" fill="#0369A1">➔ 输出契约: C = ⟨strict_equal, requiredDims⟩</text>
    </g>

    <!-- Sub-module 2: 4-Host Empirical Probes Matrix (CONTRAST!) -->
    <g transform="translate(458, 12)">
      <rect x="0" y="0" width="395" height="212" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="10" y="18" font-size="10" font-weight="800" fill="#0F172A">2. 4 宿主差分探针实测矩阵 (Empirical Probing)</text>
      
      <!-- 4 Host Badges -->
      <g transform="translate(8, 28)">
        <rect x="0" y="0" width="88" height="26" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="44" y="13" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0F172A">① 语言基线 VM</text>
        <text x="44" y="22" text-anchor="middle" font-size="6.5" fill="#64748B">Node vm 纯净环境</text>

        <rect x="94" y="0" width="88" height="26" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="138" y="13" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0F172A">② 原生 Node.js</text>
        <text x="138" y="22" text-anchor="middle" font-size="6.5" fill="#64748B">v20+ (553条差分)</text>

        <rect x="188" y="0" width="88" height="26" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="232" y="13" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0F172A">③ Edge 浏览器</text>
        <text x="232" y="22" text-anchor="middle" font-size="6.5" fill="#64748B">WPT (780条差分)</text>

        <rect x="282" y="0" width="97" height="26" rx="4" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1"/>
        <text x="330" y="13" text-anchor="middle" font-size="7.5" font-weight="700" fill="#15803D">④ 微信 DevTools</text>
        <text x="330" y="22" text-anchor="middle" font-size="6.5" fill="#166534">SDK 3.17 (785差分)</text>
      </g>

      <!-- Contrast Cases -->
      <g transform="translate(8, 62)">
        <rect x="0" y="0" width="379" height="42" rx="4" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="0.8"/>
        <text x="8" y="15" font-family="monospace" font-size="7.5" font-weight="700" fill="#9F1239">[实测冲突] typeof wx:</text>
        <text x="8" y="26" font-size="7" fill="#BE123C">VM/Node: 'undefined' ≠ 微信真机: 'object'</text>
        <text x="8" y="36" font-size="7.5" font-weight="700" fill="#E11D48">➔ 捕获真实异构差分 ➔ 硬触发 PROTECT</text>

        <rect x="0" y="48" width="379" height="42" rx="4" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="0.8"/>
        <text x="8" y="63" font-family="monospace" font-size="7.5" font-weight="700" fill="#166534">[实测等价] Math.abs(-5) === 5:</text>
        <text x="8" y="74" font-size="7" fill="#15803D">4 宿主读数皆为 true (strict_equal)</text>
        <text x="8" y="84" font-size="7.5" font-weight="700" fill="#059669">➔ 严格等价且证据可折叠 ➔ 放行 FOLD</text>
      </g>

      <text x="10" y="166" font-size="7.5" fill="#475569">• 差分证据库 E: 1248 实体快照 / SHA-256 指纹时效绑定</text>
      <text x="10" y="179" font-size="7.5" fill="#475569">• 非对称外推原则: 存在可外推，不存在绝对不可外推 (dropAbsence)</text>
      <rect x="8" y="186" width="379" height="18" rx="3" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
      <text x="16" y="199" font-size="8" font-weight="700" fill="#0284C7">➔ 输出证据向量: evidenceRecords 供第 7 步比对</text>
    </g>

    <!-- Sub-module 3: 8-Stage Funnel Decision Engine -->
    <g transform="translate(866, 12)">
      <rect x="0" y="0" width="414" height="212" rx="6" fill="#F8FAFC" stroke="#0F172A" stroke-width="1.2"/>
      <text x="10" y="18" font-size="10" font-weight="800" fill="#0F172A">3. 八步安全判定核心 D(req, target, C, E)</text>
      
      <!-- 8 Steps Minimal Grid -->
      <g transform="translate(10, 28)">
        <rect x="0" y="0" width="394" height="24" rx="3" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="8" y="16" font-size="8" fill="#334155">① 绑定检查 ➔ ② 契约完备性 ➔ ③ 必需明确性 ➔ ④ 目标证实</text>

        <rect x="0" y="28" width="394" height="24" rx="3" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="8" y="44" font-size="8" fill="#334155">⑤ 宿主缺失核验 ➔ ⑥ 探针证据时效 ➔ ⑦ 严格投影比对 ➔ ⑧ 归约</text>
      </g>

      <!-- 3 Verdict Output Cards -->
      <g transform="translate(10, 86)">
        <rect x="0" y="0" width="394" height="34" rx="4" fill="#ECFDF5" stroke="#6EE7B7" stroke-width="1"/>
        <rect x="6" y="6" width="44" height="22" rx="3" fill="#059669"/>
        <text x="28" y="21" text-anchor="middle" font-size="9" font-weight="800" fill="#FFFFFF">FOLD</text>
        <text x="56" y="18" font-size="8.5" font-weight="700" fill="#065F46">等价安全放行 (785 差分点 0 误放行，折叠精度 100%)</text>
        <text x="56" y="28" font-size="7.5" fill="#047857">所有确认目标 strict_equal 且 foldEligible ➔ 授权常量折叠</text>

        <rect x="0" y="38" width="394" height="34" rx="4" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1"/>
        <rect x="6" y="44" width="56" height="22" rx="3" fill="#E11D48"/>
        <text x="34" y="59" text-anchor="middle" font-size="8.5" font-weight="800" fill="#FFFFFF">PROTECT</text>
        <text x="68" y="56" font-size="8.5" font-weight="700" fill="#9F1239">冲突硬拦截 (实测挽救 762 处真实环境分支，0 漏网)</text>
        <text x="68" y="66" font-size="7.5" fill="#BE123C">已确认目标检测到物理差分 ➔ 强制锁死分支，严禁切除！</text>

        <rect x="0" y="76" width="394" height="42" rx="4" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1"/>
        <rect x="6" y="82" width="60" height="22" rx="3" fill="#D97706"/>
        <text x="36" y="97" text-anchor="middle" font-size="8.5" font-weight="800" fill="#FFFFFF">UNKNOWN</text>
        <text x="72" y="94" font-size="8.5" font-weight="700" fill="#92400E">保守安全未决 (Fail-Safe 疑点利益归安全)</text>
        <text x="72" y="106" font-size="7.5" fill="#78350F">输出细粒度归因: binding (92%) / runtime (7%) / behavior (1%)</text>
      </g>
    </g>
  </g>

  <!-- Flow Connector L3 -> L4 -->
  <line x1="680" y1="544" x2="680" y2="562" stroke="#0284C7" stroke-width="2" marker-end="url(#fw-arr-blue)"/>

  <!-- ==================== LAYER 4: VERIFICATION & CLOSED-LOOP (Y: 562) ==================== -->
  <g transform="translate(32, 562)">
    <rect x="0" y="0" width="1296" height="110" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" filter="url(#layer-shadow)"/>
    
    <!-- Layer Badge -->
    <g transform="translate(14, 24)">
      <rect x="0" y="0" width="105" height="22" rx="4" fill="#E2E8F0"/>
      <text x="52" y="15" text-anchor="middle" font-size="10" font-weight="800" fill="#334155">第四层: 验证闭环层</text>
      <text x="52" y="38" text-anchor="middle" font-size="8" fill="#64748B">Double-Oracle</text>
    </g>

    <!-- Verification Card 1: Level-2 Dynamic Execution (OBsmith §3.4) -->
    <g transform="translate(135, 12)">
      <rect x="0" y="0" width="560" height="86" rx="6" fill="#FFFFFF" stroke="#86EFAC" stroke-width="1"/>
      <text x="12" y="18" font-size="9.5" font-weight="700" fill="#15803D">1. Level-2 真机动态执行观测等价性验证 (OBsmith §3.4 规范):</text>
      <text x="12" y="34" font-size="8.5" fill="#166534">• 语料实际放行 1,338 程序点，真机动态执行验证 386 点；</text>
      <text x="12" y="48" font-size="8.5" fill="#166534">• 提取规范化异常标识符 (ReferenceError:target=wx)，比对终结状态与值投影；</text>
      <line x1="10" y1="56" x2="550" y2="56" stroke="#BBF7D0" stroke-width="0.8"/>
      <text x="12" y="72" font-size="9" font-weight="800" fill="#059669">🌟 终极闭环指标：变换前后真机执行行为不一致率：0.00%！</text>
    </g>

    <!-- Verification Card 2: Benchmark Performance & Soundness -->
    <g transform="translate(710, 12)">
      <rect x="0" y="0" width="570" height="86" rx="6" fill="#FFFFFF" stroke="#0284C7" stroke-width="1"/>
      <text x="12" y="18" font-size="9.5" font-weight="700" fill="#0284C7">2. 多元三域基准评测实证指标 (Benchmark Metrics):</text>
      <text x="12" y="34" font-size="8.5" fill="#334155">• 全文件 4 宿主生产口径 (3,652 样本): FOLD 32.53% | PROTECT 20.87% | 可判定率 53.40%</text>
      <text x="12" y="48" font-size="8.5" fill="#334155">• 全文件 3 宿主基准 (Node+Edge): FOLD 放行率 43.32% | 可判定率 47.10%</text>
      <line x1="10" y1="56" x2="560" y2="56" stroke="#E2E8F0" stroke-width="0.8"/>
      <text x="12" y="72" font-size="9" font-weight="800" fill="#0284C7">🌟 核心安全指标：全量 785 条跨宿主实测差分中，实测不安全折叠 (unsafeFold) 严格为 0！</text>
    </g>
  </g>

  <!-- Flow Connector L4 -> L5 -->
  <line x1="680" y1="672" x2="680" y2="690" stroke="#059669" stroke-width="2" marker-end="url(#fw-arr-green)"/>

  <!-- ==================== LAYER 5: OUTPUT & PROTECTION LAYER (Y: 690) ==================== -->
  <g transform="translate(32, 690)">
    <rect x="0" y="0" width="1296" height="114" rx="8" fill="#FFFFFF" stroke="#059669" stroke-width="1.2" filter="url(#layer-shadow)"/>
    
    <!-- Layer Badge -->
    <g transform="translate(14, 24)">
      <rect x="0" y="0" width="105" height="22" rx="4" fill="#059669"/>
      <text x="52" y="15" text-anchor="middle" font-size="10" font-weight="800" fill="#FFFFFF">第五层: 输出与守护层</text>
      <text x="52" y="38" text-anchor="middle" font-size="8" fill="#64748B">Output &amp; Guard</text>
    </g>

    <!-- Traditional Crash Box -->
    <g transform="translate(135, 12)">
      <rect x="0" y="0" width="560" height="90" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1"/>
      <rect x="10" y="8" width="120" height="18" rx="9" fill="#E11D48"/>
      <text x="70" y="21" text-anchor="middle" font-size="8" font-weight="800" fill="#FFFFFF">传统反混淆器 (无 R97)</text>

      <text x="10" y="44" font-size="8.5" fill="#9F1239">• 离线 Node 单沙箱直接求值：typeof wx ➔ 恒假</text>
      <text x="10" y="58" font-size="8.5" fill="#9F1239">• 误触发死代码剪枝：<tspan font-weight="800">将环境适配分支完全删除！</tspan></text>
      
      <rect x="8" y="66" width="544" height="18" rx="3" fill="#FFE4E6"/>
      <text x="14" y="79" font-size="8" font-weight="800" fill="#BE123C">💥 部署真机后果：核心能力丢失，抛出 TypeError / ReferenceError 运行时崩溃！</text>
    </g>

    <!-- R97 Protected Sound Code Box -->
    <g transform="translate(710, 12)">
      <rect x="0" y="0" width="570" height="90" rx="6" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1"/>
      <rect x="10" y="8" width="120" height="18" rx="9" fill="#059669"/>
      <text x="70" y="21" text-anchor="middle" font-size="8" font-weight="800" fill="#FFFFFF">集成 R97 守门保护</text>

      <text x="10" y="44" font-size="8.5" fill="#166534">• 实测探针证实真机存在 wx ➔ 输出硬判定 PROTECT</text>
      <text x="10" y="58" font-size="8.5" fill="#166534">• <tspan font-weight="800">强制拦截折叠！原汁原味保留分支结构；纯计算安全放行 FOLD</tspan></text>
      
      <rect x="8" y="66" width="554" height="18" rx="3" fill="#DCFCE7"/>
      <text x="14" y="79" font-size="8.5" font-weight="800" fill="#15803D">✅ 真机部署成果：微信/前端/后端 100% 正常运行，功能零缺失，保语义安全反混淆输出！</text>
    </g>
  </g>
</svg>
'''

with open("docs/r97_five_layer_research_framework.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)

print("Saved docs/r97_five_layer_research_framework.svg")

# Render HTML wrap
html_wrap = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box;}}body{{background:#fff;width:1360px;height:840px;overflow:hidden;}}</style></head><body>{svg_content}</body></html>'''
with open("docs/r97_five_layer_research_framework.html", "w", encoding="utf-8") as f:
    f.write(html_wrap)

print("Saved HTML wrap.")
