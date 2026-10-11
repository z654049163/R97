import os
import subprocess

# ==============================================================================
# 1. 简洁干练版模型图: r97_concise_model_architecture.svg
# 核心原则: 去除冗长文字堆砌与嵌套小卡片，重点聚焦于 [代码侧需求] vs [外部目标] 的正交解耦与 [中央守门决策]
# ==============================================================================
svg_concise_model = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1360 620" width="1360" height="620" style="background:#FFFFFF; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, 'Source Han Sans SC', 'Microsoft YaHei', sans-serif;">
  <defs>
    <filter id="c-shadow" x="-3%" y="-2%" width="106%" height="106%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0F172A" flood-opacity="0.04" />
    </filter>

    <marker id="arr-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7"/>
    </marker>
    <marker id="arr-purple" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#7C3AED"/>
    </marker>
    <marker id="arr-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669"/>
    </marker>
    <marker id="arr-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#DC2626"/>
    </marker>
    <marker id="arr-dark" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#334155"/>
    </marker>
  </defs>

  <!-- Canvas Outer Border -->
  <rect x="12" y="12" width="1336" height="596" rx="4" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>

  <!-- Figure Header -->
  <g transform="translate(28, 30)">
    <text x="0" y="10" font-size="15" font-weight="800" fill="#0F172A">Figure 1 | R97 系统判定模型 (Concise Architecture Model)</text>
    <text x="0" y="26" font-size="11" fill="#64748B">核心正交解耦公理：代码能力需求 (Required) 与外部目标环境 (Target) 严格独立 · 实测探针驱动守门</text>
  </g>

  <!-- Left: Dual-Track Decoupled Extraction -->
  <g transform="translate(28, 70)">
    <rect x="0" y="0" width="360" height="470" rx="8" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
    <text x="16" y="24" font-size="12" font-weight="800" fill="#0F172A">一、特征解耦提取层 (Decoupled Extraction)</text>

    <!-- Top Track: Code-side -->
    <g transform="translate(16, 40)">
      <rect x="0" y="0" width="328" height="150" rx="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1.2"/>
      <rect x="0" y="0" width="328" height="22" rx="6" fill="#E0F2FE" stroke="#BAE6FD" stroke-width="1.2"/>
      <text x="10" y="15" font-size="10" font-weight="700" fill="#0369A1">代码侧（内部证据）➔ 必需能力依赖</text>

      <g transform="translate(12, 34)">
        <text x="0" y="12" font-family="monospace" font-size="10" font-weight="700" fill="#0F172A">if (typeof wx !== 'undefined')</text>
        <text x="12" y="28" font-family="monospace" font-size="9" fill="#0284C7">wx.request({ url: '...' })</text>
        <line x1="0" y1="36" x2="304" y2="36" stroke="#E2E8F0" stroke-width="1"/>
        <text x="0" y="52" font-size="9" fill="#475569">• AST 作用域解析：排除局部形参遮蔽变量</text>
        <text x="0" y="68" font-size="9" fill="#475569">• 常量别名追踪：还原 client ➔ wx 依赖链</text>
        <text x="0" y="84" font-size="9" font-weight="700" fill="#15803D">➔ 输出必需运行时: required = { Wechat, definite }</text>
      </g>
    </g>

    <!-- Center Barrier: Orthogonal Firewall -->
    <g transform="translate(16, 202)">
      <rect x="0" y="0" width="328" height="54" rx="6" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2" stroke-dasharray="3 3"/>
      <text x="164" y="22" text-anchor="middle" font-size="10" font-weight="800" fill="#E11D48">🔒 正交隔离防火墙 (Required ⊥ Target)</text>
      <text x="164" y="40" text-anchor="middle" font-size="8.5" fill="#9F1239">严禁循环论证：代码内部依赖 wx，绝不能作为目标是微信的证据！</text>
    </g>

    <!-- Bottom Track: Evidence-side -->
    <g transform="translate(16, 268)">
      <rect x="0" y="0" width="328" height="150" rx="6" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1.2"/>
      <rect x="0" y="0" width="328" height="22" rx="6" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1.2"/>
      <text x="10" y="15" font-size="10" font-weight="700" fill="#6D28D9">证据侧（外部证据）➔ 真实目标环境确立</text>

      <g transform="translate(12, 34)">
        <text x="0" y="12" font-family="monospace" font-size="9.5" font-weight="700" fill="#0F172A">project.config.json / package.json</text>
        <text x="0" y="26" font-size="8.5" fill="#6D28D9">外部项目配置清单 · 部署环境指纹</text>
        <line x1="0" y1="34" x2="304" y2="34" stroke="#E2E8F0" stroke-width="1"/>
        <text x="0" y="50" font-size="9" fill="#475569">• 目标解析器：严格校验外部客观事实</text>
        <text x="0" y="66" font-size="9" fill="#475569">• 排除代码自身干扰，防范多源配置互斥冲突</text>
        <text x="0" y="82" font-size="9" font-weight="700" fill="#5B21B6">➔ 输出确认目标: target = { Wechat, confirmed }</text>
      </g>
    </g>
  </g>

  <!-- Connectors from Track 1 to Center -->
  <line x1="388" y1="185" x2="422" y2="185" stroke="#0284C7" stroke-width="1.5" marker-end="url(#arr-blue)"/>
  <line x1="388" y1="410" x2="422" y2="410" stroke="#7C3AED" stroke-width="1.5" marker-end="url(#arr-purple)"/>

  <!-- Center: Decision Core & Multi-Host Probing -->
  <g transform="translate(422, 70)">
    <rect x="0" y="0" width="500" height="470" rx="8" fill="#FFFFFF" filter="url(#c-shadow)" stroke="#CBD5E1" stroke-width="1"/>
    <text x="16" y="24" font-size="12" font-weight="800" fill="#0F172A">二、语义契约与四宿主实测守门核心 (Decision Engine)</text>

    <!-- Top: Semantic Contract & Non-deterministic Trap -->
    <g transform="translate(16, 40)">
      <rect x="0" y="0" width="468" height="84" rx="6" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="1"/>
      <text x="12" y="18" font-size="10" font-weight="700" fill="#0369A1">语义契约模型 C：用法上下文维度投影</text>
      
      <g transform="translate(12, 28)">
        <rect x="0" y="0" width="85" height="20" rx="10" fill="#FFFFFF" stroke="#0284C7" stroke-width="0.8"/>
        <text x="42" y="14" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0284C7">typeof 维度</text>

        <rect x="95" y="0" width="95" height="20" rx="10" fill="#FFFFFF" stroke="#0284C7" stroke-width="0.8"/>
        <text x="142" y="14" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0284C7">truthiness 维度</text>

        <rect x="200" y="0" width="95" height="20" rx="10" fill="#FFFFFF" stroke="#0284C7" stroke-width="0.8"/>
        <text x="247" y="14" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0284C7">return_val 维度</text>
      </g>
      <text x="12" y="70" font-size="8.5" fill="#DC2626">⚠️ 非确定性语言内建拦截：Date.now / Math.random 强制要求 return_val ➔ 守住未决 UNKNOWN</text>
    </g>

    <!-- Middle: 4-Host Empirical Observations -->
    <g transform="translate(16, 136)">
      <rect x="0" y="0" width="468" height="156" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="12" y="18" font-size="10" font-weight="700" fill="#0F172A">4 宿主差分探针实测读数矩阵 (Empirical Probing Contrast)</text>

      <!-- 4 Host Boxes -->
      <g transform="translate(12, 28)">
        <rect x="0" y="0" width="102" height="34" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="51" y="14" text-anchor="middle" font-size="8" font-weight="700" fill="#0F172A">① 语言基线 VM</text>
        <text x="51" y="26" text-anchor="middle" font-size="7.5" fill="#64748B">Node vm 干净基线</text>

        <rect x="112" y="0" width="102" height="34" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="163" y="14" text-anchor="middle" font-size="8" font-weight="700" fill="#0F172A">② 原生 Node.js</text>
        <text x="163" y="26" text-anchor="middle" font-size="7.5" fill="#64748B">后端 v20+ 生产环境</text>

        <rect x="224" y="0" width="102" height="34" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="275" y="14" text-anchor="middle" font-size="8" font-weight="700" fill="#0F172A">③ Headless 浏览器</text>
        <text x="275" y="26" text-anchor="middle" font-size="7.5" fill="#64748B">MS Edge (DOM/BOM)</text>

        <rect x="336" y="0" width="108" height="34" rx="4" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1"/>
        <text x="390" y="14" text-anchor="middle" font-size="8" font-weight="700" fill="#15803D">④ 微信官方 DevTools</text>
        <text x="390" y="26" text-anchor="middle" font-size="7.5" fill="#166534">SDK 3.17.3 真机实测</text>
      </g>

      <!-- Concrete Probing Readings -->
      <g transform="translate(12, 70)">
        <rect x="0" y="0" width="444" height="36" rx="4" fill="#FFF1F2" stroke="#FECDD3" stroke-width="0.8"/>
        <text x="10" y="15" font-family="monospace" font-size="8" font-weight="700" fill="#9F1239">[实测冲突] typeof wx:</text>
        <text x="10" y="28" font-size="7.5" fill="#BE123C">VM: 'undefined' | Node: 'undefined' | Edge: 'undefined' | <tspan font-weight="700" fill="#E11D48">微信真机: 'object'</tspan> ➔ 真实冲突 ➔ 硬 PROTECT</text>

        <rect x="0" y="42" width="444" height="36" rx="4" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="0.8"/>
        <text x="10" y="57" font-family="monospace" font-size="8" font-weight="700" fill="#166534">[实测等价] Math.abs(-5) === 5:</text>
        <text x="10" y="70" font-size="7.5" fill="#15803D">VM: true | Node: true | Edge: true | 微信: true ➔ <tspan font-weight="700" fill="#059669">4端完全 strict_equal 且证据可折叠 ➔ 放行 FOLD</tspan></text>
      </g>
    </g>

    <!-- Bottom: 8-Stage Fail-Safe Rules -->
    <g transform="translate(16, 304)">
      <rect x="0" y="0" width="468" height="150" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
      <text x="12" y="18" font-size="10" font-weight="700" fill="#0F172A">判定规则流 D(required, target, contract, evidence):</text>
      
      <g transform="translate(12, 28)">
        <rect x="0" y="0" width="444" height="34" rx="4" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="0.8"/>
        <text x="10" y="15" font-size="8.5" font-weight="700" fill="#E11D48">【规则 1 · 冲突保护】已确认目标 confirmed + 确定依赖 definite + 真实冲突 ➔ PROTECT</text>
        <text x="10" y="27" font-size="7.5" fill="#9F1239">直接拦截代码变换，原样保留分支结构，防止环境敏感逻辑被恶意剪除（0 漏网）</text>

        <rect x="0" y="40" width="444" height="34" rx="4" fill="#F0FDF4" stroke="#6EE7B7" stroke-width="0.8"/>
        <text x="10" y="55" font-size="8.5" font-weight="700" fill="#059669">【规则 2 · 等价放行】已确认目标 confirmed + 契约维度严格一致 + 证据 foldEligible ➔ FOLD</text>
        <text x="10" y="67" font-size="7.5" fill="#047857">证实行为严格一致，授权下游执行常量折叠与死代码剪枝（实测差分误放行 0，精度 100%）</text>

        <rect x="0" y="80" width="444" height="34" rx="4" fill="#FFFBEB" stroke="#FDE68A" stroke-width="0.8"/>
        <text x="10" y="95" font-size="8.5" font-weight="700" fill="#D97706">【规则 3 · 安全兜底】目标未确认 (inferred/unknown) 或 契约维度缺失 ➔ UNKNOWN</text>
        <text x="10" y="107" font-size="7.5" fill="#92400E">保守兜底不折叠，并输出细粒度归因 (binding / runtime / behavior)，确保绝对零事故</text>
      </g>
    </g>
  </g>

  <!-- Connectors from Center to Right -->
  <line x1="922" y1="200" x2="956" y2="200" stroke="#059669" stroke-width="1.5" marker-end="url(#arr-green)"/>
  <line x1="922" y1="360" x2="956" y2="360" stroke="#DC2626" stroke-width="1.5" marker-end="url(#arr-red)"/>
  <line x1="922" y1="420" x2="956" y2="420" stroke="#D97706" stroke-width="1.5" marker-end="url(#arr-dark)"/>

  <!-- Right: Downstream Guard Impact -->
  <g transform="translate(956, 70)">
    <rect x="0" y="0" width="375" height="470" rx="8" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
    <text x="16" y="24" font-size="12" font-weight="800" fill="#0F172A">三、下游反混淆优化对比 (Guard Impact)</text>

    <!-- Traditional Crash Box -->
    <g transform="translate(16, 40)">
      <rect x="0" y="0" width="343" height="160" rx="6" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2"/>
      <rect x="10" y="10" width="120" height="20" rx="10" fill="#E11D48"/>
      <text x="70" y="24" text-anchor="middle" font-size="8.5" font-weight="800" fill="#FFFFFF">传统反混淆器 (无R97)</text>

      <g transform="translate(12, 40)">
        <text x="0" y="12" font-size="9" fill="#9F1239">• 在离线单 Node VM 中求值：typeof wx ➔ 'undefined'</text>
        <text x="0" y="28" font-size="9" fill="#9F1239">• 误触发死代码剪枝：<tspan font-weight="800">将 if(wx) 分支完全切除！</tspan></text>
        <text x="0" y="44" font-size="9" fill="#9F1239">• 保留了错误的空分支或报错 fallback 代码</text>
        
        <rect x="0" y="58" width="319" height="52" rx="4" fill="#FFE4E6"/>
        <text x="10" y="76" font-size="9.5" font-weight="800" fill="#BE123C">💥 部署到真实微信环境的后果：</text>
        <text x="10" y="92" font-size="8.5" fill="#9F1239">核心业务逻辑缺失，抛出 TypeError / ReferenceError 运行时崩溃！</text>
      </g>
    </g>

    <!-- R97 Protected Box -->
    <g transform="translate(16, 220)">
      <rect x="0" y="0" width="343" height="198" rx="6" fill="#F0FDF4" stroke="#6EE7B7" stroke-width="1.2"/>
      <rect x="10" y="10" width="120" height="20" rx="10" fill="#059669"/>
      <text x="70" y="24" text-anchor="middle" font-size="8.5" font-weight="800" fill="#FFFFFF">集成 R97 守门保护</text>

      <g transform="translate(12, 40)">
        <text x="0" y="12" font-size="9" fill="#065F46">• 实测探针证实微信环境存在 wx ➔ 输出硬判定 PROTECT</text>
        <text x="0" y="28" font-size="9" fill="#065F46">• <tspan font-weight="800">强制拦截折叠！原汁原味保留完整宿主分支</tspan></text>
        <text x="0" y="44" font-size="9" fill="#047857">• 纯语言计算 (如 1+1, Math.abs) 则安全放行 FOLD</text>
        
        <rect x="0" y="58" width="319" height="88" rx="4" fill="#DCFCE7"/>
        <text x="10" y="76" font-size="9.5" font-weight="800" fill="#15803D">✅ 部署到真实微信环境的成果：</text>
        <text x="10" y="92" font-size="8.5" fill="#166534">• 微信小程序 100% 正常运行，所有宿主能力零丢失；</text>
        <text x="10" y="106" font-size="8.5" fill="#166534">• Level-2 动态执行验证 386 样本，行为不一致率：0.00%；</text>
        <text x="10" y="120" font-size="8.5" font-weight="800" fill="#059669">• 785 条跨宿主实测差分，不安全折叠 0，折叠准确率 100%！</text>
      </g>
    </g>
  </g>

  <!-- Global Footer -->
  <g transform="translate(28, 554)">
    <rect x="0" y="0" width="1303" height="42" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="16" y="18" font-size="9.5" font-weight="700" fill="#0F172A">R97 全景系统架构定理 (Comprehensive Architectural Invariants):</text>
    <text x="16" y="32" font-size="8.5" fill="#64748B">
      [1] 三生态覆盖：前端 WPT (13k记录) + 后端 Node (22k记录) + 微信小程序 (120万点)；
      [2] 实测差分驱动：真机探针采集 785 差分点精准拦截；
      [3] 零不安全折叠保证：Level-2 动态执行不一致率 0.00%！
    </text>
  </g>
</svg>
'''

with open("docs/r97_concise_model_architecture.svg", "w", encoding="utf-8") as f:
    f.write(svg_concise_model)

print("Saved docs/r97_concise_model_architecture.svg")

# ==============================================================================
# 2. 借鉴 MINIAUTH (CCS 2024 / 图5) 风格的端到端工作流图: r97_workflow_architecture.svg
# 核心原则: 超宽扁平比例 (3.2:1)，清晰的阶段划分、分流与汇聚，阶段容器加核心算子
# ==============================================================================
svg_workflow = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 520" width="1440" height="520" style="background:#FFFFFF; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, 'Source Han Sans SC', 'Microsoft YaHei', sans-serif;">
  <defs>
    <marker id="wf-arr-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7"/>
    </marker>
    <marker id="wf-arr-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669"/>
    </marker>
    <marker id="wf-arr-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#DC2626"/>
    </marker>
    <marker id="wf-arr-purple" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#7C3AED"/>
    </marker>
    <marker id="wf-arr-dark" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#334155"/>
    </marker>
  </defs>

  <!-- Outer Border -->
  <rect x="12" y="12" width="1416" height="496" rx="4" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>

  <!-- Workflow Header -->
  <g transform="translate(28, 30)">
    <rect x="0" y="-3" width="80" height="20" rx="10" fill="#F1F5F9"/>
    <text x="40" y="11" text-anchor="middle" font-size="10" font-weight="700" fill="#475569">PIPELINE</text>
    <text x="90" y="13" font-size="15" font-weight="800" fill="#0F172A">Figure 2 | R97 端到端工作流 (End-to-End Workflow Pipeline)</text>
    <text x="0" y="28" font-size="10.5" fill="#64748B">
      对标 MINIAUTH (ACM CCS) 宽屏分层工作流范式 · 从混淆输入到保语义代码生成的全流程流水线
    </text>
  </g>

  <!-- Phase 1: Ingestion & Static AST Analysis -->
  <g transform="translate(28, 70)">
    <rect x="0" y="0" width="310" height="390" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
    <text x="12" y="20" font-size="11" font-weight="800" fill="#0F172A">阶段 I: 语法解析与特征提取 (Ingestion)</text>

    <!-- Block 1: Source Files -->
    <g transform="translate(12, 34)">
      <rect x="0" y="0" width="286" height="88" rx="4" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0369A1">1. 多源混淆代码包输入</text>
      <text x="10" y="32" font-size="8.5" fill="#64748B">• 微信小程序包 (app-service.js / 1572项目)</text>
      <text x="10" y="46" font-size="8.5" fill="#64748B">• 前端 Web 平台测试包 (WPT / 900文件)</text>
      <text x="10" y="60" font-size="8.5" fill="#64748B">• 后端 Node.js 服务端包 (Node / 900文件)</text>
      <text x="10" y="74" font-size="8" fill="#0284C7">➔ 生成解析用例流与原始 AST 节点</text>
    </g>

    <!-- Block 2: Scope & Shadowing Engine -->
    <g transform="translate(12, 132)">
      <rect x="0" y="0" width="286" height="110" rx="4" fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0284C7">2. AST 作用域与词法遮蔽分析器</text>
      <text x="10" y="34" font-size="8.5" fill="#334155">• 词法作用域树构建：自顶向下解析作用域链</text>
      <text x="10" y="48" font-size="8.5" fill="#334155">• 形参遮蔽过滤：function(wx) 消除全局伪依赖</text>
      <text x="10" y="62" font-size="8.5" fill="#334155">• 常量别名链追踪：const client = wx 追溯</text>
      <text x="10" y="76" font-size="8.5" fill="#334155">• 宿主归属表匹配：区分宿主专属根与语言内建</text>
      <line x1="8" y1="84" x2="278" y2="84" stroke="#E2E8F0" stroke-width="1"/>
      <text x="10" y="98" font-size="8.5" font-weight="700" fill="#15803D">➔ 产出待折叠候选集合 (Candidate Findings)</text>
    </g>

    <!-- Block 3: Pre-filter -->
    <g transform="translate(12, 252)">
      <rect x="0" y="0" width="286" height="124" rx="4" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0F172A">3. 前置极简快速分流 (Pre-Filter)</text>
      <g transform="translate(8, 26)">
        <rect x="0" y="0" width="270" height="42" rx="3" fill="#F0FDF4" stroke="#86EFAC" stroke-width="0.8"/>
        <text x="8" y="16" font-size="8" font-weight="700" fill="#15803D">分支 A: 纯局部变量 / 纯内建数值计算</text>
        <text x="8" y="30" font-size="7.5" fill="#166534">不依赖宿主能力 ➔ 快速通道直接放行 (Fast-Path)</text>

        <rect x="0" y="48" width="270" height="42" rx="3" fill="#FEF3C7" stroke="#FDE68A" stroke-width="0.8"/>
        <text x="8" y="64" font-size="8" font-weight="700" fill="#B45309">分支 B: 包含外部宿主 API 访问或动态键</text>
        <text x="8" y="78" font-size="7.5" fill="#92400E">进入 R97 核心守门流水线 (Guard Pipeline) ➔</text>
      </g>
    </g>
  </g>

  <!-- Flow Arrow from Phase 1 to Phase 2 -->
  <line x1="338" y1="365" x2="368" y2="365" stroke="#D97706" stroke-width="1.5" marker-end="url(#wf-arr-blue)"/>

  <!-- Phase 2: Evidence Resolution & Firewall -->
  <g transform="translate(368, 70)">
    <rect x="0" y="0" width="310" height="390" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
    <text x="12" y="20" font-size="11" font-weight="800" fill="#0F172A">阶段 II: 证据确立与隔离审查</text>

    <!-- Block 1: Manifest Resolver -->
    <g transform="translate(12, 34)">
      <rect x="0" y="0" width="286" height="110" rx="4" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1.2"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#6D28D9">1. 外部部署证据解析 (Target Resolver)</text>
      <text x="10" y="34" font-size="8.5" fill="#475569">• 摄取 project.config.json / package.json</text>
      <text x="10" y="48" font-size="8.5" fill="#475569">• 提取平台标识、基础库版本、构建指纹</text>
      <text x="10" y="62" font-size="8.5" fill="#475569">• 证据定级：confirmed (强证实) vs inferred</text>
      <line x1="8" y1="72" x2="278" y2="72" stroke="#E2E8F0" stroke-width="1"/>
      <text x="10" y="88" font-size="8.5" font-weight="700" fill="#5B21B6">➔ 输出客观目标环境: target = { Wechat, confirmed }</text>
      <text x="10" y="100" font-size="7.5" fill="#DC2626">未确认目标一律禁止授权折叠！</text>
    </g>

    <!-- Block 2: Firewall -->
    <g transform="translate(12, 154)">
      <rect x="0" y="0" width="286" height="90" rx="4" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2" stroke-dasharray="3 3"/>
      <text x="143" y="20" text-anchor="middle" font-size="9.5" font-weight="800" fill="#E11D48">🔒 正交隔离审查防火墙</text>
      <text x="143" y="36" text-anchor="middle" font-size="8.5" font-weight="700" fill="#9F1239">Required ⊥ Target (禁止循环论证)</text>
      <text x="14" y="54" font-size="8" fill="#BE123C">• 代码有 wx 仅代表依赖需求 (required)</text>
      <text x="14" y="68" font-size="8" fill="#BE123C">• 严禁借此反推目标环境！目标必须由外部独立给出</text>
      <text x="14" y="82" font-size="7.5" font-weight="700" fill="#E11D48">➔ 审查通过后构造 DecisionQuery 进入判卷</text>
    </g>

    <!-- Block 3: Query Dispatcher -->
    <g transform="translate(12, 254)">
      <rect x="0" y="0" width="286" height="122" rx="4" fill="#FFFFFF" stroke="#0284C7" stroke-width="1"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0284C7">3. 判定查询构造 (DecisionQuery)</text>
      <text x="10" y="34" font-size="8.5" fill="#334155">• 将每个候选点绑定为五元组：</text>
      <text x="18" y="48" font-family="monospace" font-size="8" fill="#0369A1">Query = ⟨pointId, entity, target, evalHost, version⟩</text>
      <text x="10" y="64" font-size="8.5" fill="#334155">• 为每个点定制唯一的 SHA-256 唯一防伪 ID</text>
      <line x1="8" y1="74" x2="278" y2="74" stroke="#E2E8F0" stroke-width="1"/>
      <text x="10" y="90" font-size="8.5" font-weight="700" fill="#0284C7">➔ 并行分发给中央决策引擎与探针比对 ➔</text>
    </g>
  </g>

  <!-- Flow Arrow from Phase 2 to Phase 3 -->
  <line x1="678" y1="265" x2="708" y2="265" stroke="#0284C7" stroke-width="1.5" marker-end="url(#wf-arr-blue)"/>

  <!-- Phase 3: Semantic Verification & Probing -->
  <g transform="translate(708, 70)">
    <rect x="0" y="0" width="370" height="390" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
    <text x="12" y="20" font-size="11" font-weight="800" fill="#0F172A">阶段 III: 契约核验与探针实测 (Probing)</text>

    <!-- Block 1: Contract Checking -->
    <g transform="translate(12, 34)">
      <rect x="0" y="0" width="346" height="84" rx="4" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0369A1">1. 语义契约投影与非确定性陷阱核验</text>
      <text x="10" y="34" font-size="8.5" fill="#475569">• 投影 AST 运算维度：[typeof, truthiness, return_val]</text>
      <text x="10" y="48" font-size="8.5" fill="#DC2626">• 拦截 Date.now / Math.random 等时变调用 (OBsmith §3.1)</text>
      <text x="10" y="62" font-size="8.5" fill="#0284C7">➔ 契约约束集生成：C = ⟨strict_equal, requiredDims⟩</text>
    </g>

    <!-- Block 2: 4-Host Empirical Dispatch -->
    <g transform="translate(12, 126)">
      <rect x="0" y="0" width="346" height="150" rx="4" fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0284C7">2. 4 宿主多执行面实测比对 (JEST 拓扑对标)</text>
      
      <!-- 4 Host Matrix -->
      <g transform="translate(8, 26)">
        <rect x="0" y="0" width="78" height="28" rx="3" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="39" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0F172A">① 隔离 VM</text>
        <text x="39" y="23" text-anchor="middle" font-size="6.5" fill="#64748B">纯语言基线</text>

        <rect x="83" y="0" width="78" height="28" rx="3" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="122" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0F172A">② 原生 Node</text>
        <text x="122" y="23" text-anchor="middle" font-size="6.5" fill="#64748B">553 条实测差分</text>

        <rect x="166" y="0" width="78" height="28" rx="3" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="205" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0F172A">③ Edge 浏览器</text>
        <text x="205" y="23" text-anchor="middle" font-size="6.5" fill="#64748B">780 条实测差分</text>

        <rect x="249" y="0" width="81" height="28" rx="3" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1"/>
        <text x="289" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#15803D">④ 微信 DevTools</text>
        <text x="289" y="23" text-anchor="middle" font-size="6.5" fill="#166534">785 条微信差分</text>
      </g>

      <!-- Comparison outcome banner -->
      <g transform="translate(8, 62)">
        <rect x="0" y="0" width="330" height="42" rx="3" fill="#FFF1F2" stroke="#FECDD3" stroke-width="0.8"/>
        <text x="8" y="14" font-family="monospace" font-size="7.5" font-weight="700" fill="#9F1239">实测差异案例：typeof wx</text>
        <text x="8" y="26" font-size="7" fill="#BE123C">VM/Node/Edge: 'undefined' ≠ 微信真机: 'object'</text>
        <text x="8" y="36" font-size="7" font-weight="700" fill="#E11D48">➔ 检测到跨宿主执行分歧 (Divergence Detected)!</text>
      </g>
      <text x="10" y="118" font-size="8" fill="#475569">• 证据库持久化：SHA-256 签名 + SDK版本时效失效机制</text>
      <text x="10" y="132" font-size="8" font-weight="700" fill="#15803D">• Level-2 动态执行验证：386 样本行为不一致率 0.00%</text>
    </g>

    <!-- Block 3: Decision Engine Execution -->
    <g transform="translate(12, 284)">
      <rect x="0" y="0" width="346" height="94" rx="4" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.2"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0F172A">3. 八步安全判定核心 D(req, target, C, E)</text>
      <text x="10" y="34" font-size="8" fill="#334155">①绑定 ➔ ②契约 ➔ ③明确性 ➔ ④目标证实 ➔ ⑤硬缺 ➔ ⑥证据 ➔ ⑦投影 ➔ ⑧归约</text>
      <line x1="8" y1="42" x2="338" y2="42" stroke="#E2E8F0" stroke-width="1"/>
      <g transform="translate(8, 50)">
        <text x="0" y="12" font-size="8" font-weight="700" fill="#059669">• 严格等价且可折叠 ➔ 发放 FOLD 凭证</text>
        <text x="0" y="24" font-size="8" font-weight="700" fill="#DC2626">• 实测存在环境冲突 ➔ 输出 PROTECT 强力拦截</text>
        <text x="0" y="36" font-size="8" font-weight="700" fill="#D97706">• 目标未确认或证据不足 ➔ 安全兜底 UNKNOWN</text>
      </g>
    </g>
  </g>

  <!-- Flow Arrow from Phase 3 to Phase 4 -->
  <line x1="1078" y1="265" x2="1108" y2="265" stroke="#0F172A" stroke-width="1.5" marker-end="url(#wf-arr-dark)"/>

  <!-- Phase 4: Downstream Guard & Sound Code Emission -->
  <g transform="translate(1108, 70)">
    <rect x="0" y="0" width="304" height="390" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
    <text x="12" y="20" font-size="11" font-weight="800" fill="#0F172A">阶段 IV: 守门裁决与保语义代码生成</text>

    <!-- Block 1: Gatekeeper Multiplexer -->
    <g transform="translate(12, 34)">
      <rect x="0" y="0" width="280" height="150" rx="4" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.2"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#0F172A">三值判定网关 (Tri-State Decision Gate)</text>

      <g transform="translate(8, 26)">
        <rect x="0" y="0" width="264" height="34" rx="3" fill="#ECFDF5" stroke="#6EE7B7" stroke-width="0.8"/>
        <text x="8" y="14" font-size="8.5" font-weight="800" fill="#059669">✅ FOLD (等价安全放行)</text>
        <text x="8" y="26" font-size="7.5" fill="#047857">授权下游执行常量折叠 (实测差分误放行: 0)</text>

        <rect x="0" y="38" width="264" height="34" rx="3" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="0.8"/>
        <text x="8" y="52" font-size="8.5" font-weight="800" fill="#E11D48">🛡️ PROTECT (冲突硬拦截)</text>
        <text x="8" y="64" font-size="7.5" fill="#9F1239">强制拦截折叠！保留完整敏感分支结构</text>

        <rect x="0" y="76" width="264" height="38" rx="3" fill="#FFFBEB" stroke="#FDE68A" stroke-width="0.8"/>
        <text x="8" y="90" font-size="8.5" font-weight="800" fill="#D97706">⚠️ UNKNOWN (保守安全未决)</text>
        <text x="8" y="102" font-size="7" fill="#78350F">输出归因 (binding / runtime / behavior)</text>
      </g>
    </g>

    <!-- Block 2: Downstream AST Rewriter & Sound Code Output -->
    <g transform="translate(12, 194)">
      <rect x="0" y="0" width="280" height="184" rx="4" fill="#FFFFFF" stroke="#059669" stroke-width="1.2"/>
      <text x="10" y="18" font-size="9.5" font-weight="700" fill="#059669">下游反混淆器与代码生成 (webcrack/terser)</text>

      <g transform="translate(8, 26)">
        <!-- Comparison Output -->
        <rect x="0" y="0" width="264" height="56" rx="3" fill="#FFF1F2" stroke="#FECDD3" stroke-width="0.8"/>
        <text x="6" y="14" font-size="8" font-weight="700" fill="#9F1239">无 R97 守护（传统反混淆）：</text>
        <text x="6" y="26" font-size="7.5" fill="#BE123C">• Node VM 求值 ➔ 误判 typeof wx 恒假</text>
        <text x="6" y="38" font-size="7.5" font-weight="700" fill="#E11D48">• 切除 wx 分支 ➔ 部署真机运行时崩溃！</text>

        <rect x="0" y="62" width="264" height="84" rx="3" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1"/>
        <text x="6" y="76" font-size="8.5" font-weight="800" fill="#15803D">集成 R97 守门（安全保真输出）：</text>
        <text x="6" y="90" font-size="7.5" fill="#166534">• 拦截 wx.request 误切 ➔ 敏感分支完整保留</text>
        <text x="6" y="102" font-size="7.5" fill="#166534">• 纯语言计算安全折叠 ➔ 体积精简</text>
        <text x="6" y="114" font-size="7.5" font-weight="700" fill="#059669">• 真机部署：微信/前端/后端 100% 正常运行！</text>
        <text x="6" y="126" font-size="7.5" font-weight="700" fill="#059669">• 零不安全折叠 (0 Unsafe Folds Guarantee)</text>
      </g>
    </g>
  </g>

  <!-- Global Bottom Summary Banner -->
  <g transform="translate(28, 468)">
    <rect x="0" y="0" width="1384" height="34" rx="4" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="16" y="21" font-size="9" font-weight="700" fill="#0F172A">
      工作流总结：前端 WPT / 后端 Node / 微信小程序源码 ➔ AST 解析与外部指纹解耦 ➔ 契约与 4 宿主实测探针核验 ➔ 三值网关拦截冲突 ➔ 保语义安全反混淆输出。
    </text>
  </g>
</svg>
'''

with open("docs/r97_workflow_architecture.svg", "w", encoding="utf-8") as f:
    f.write(svg_workflow)

print("Saved docs/r97_workflow_architecture.svg")

# Render HTML wrap
html_wrap_model = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box;}}body{{background:#fff;width:1360px;height:620px;overflow:hidden;}}</style></head><body>{svg_concise_model}</body></html>'''
with open("docs/r97_concise_model_architecture.html", "w", encoding="utf-8") as f:
    f.write(html_wrap_model)

html_wrap_wf = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box;}}body{{background:#fff;width:1440px;height:520px;overflow:hidden;}}</style></head><body>{svg_workflow}</body></html>'''
with open("docs/r97_workflow_architecture.html", "w", encoding="utf-8") as f:
    f.write(html_wrap_wf)

print("Saved HTML wrappers.")
