import os
import subprocess

# ==============================================================================
# R97 顶会经典极简双层架构图 (Figure 1: Minimalist Framework with Code Example)
# 参照 NDSS 2026 JSIMPLIFIER 官方架构图设计:
# - 上层 (Top): 三大核心模块 (① 输入与特征提取 -> ② R97 守门核心 -> ③ 保语义优化输出)
# - 下层 (Bottom): 真实代码转换演进对比 (原始混淆代码 -> 传统工具误杀崩溃 vs R97 守门保真)
# ==============================================================================

svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 640" width="1440" height="640" style="background:#FFFFFF; font-family:'Microsoft YaHei', 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <defs>
    <!-- Soft Shadows -->
    <filter id="box-shadow" x="-3%" y="-2%" width="106%" height="106%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.04" />
    </filter>

    <!-- Connectors -->
    <marker id="arrow-gray" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B"/>
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563EB"/>
    </marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669"/>
    </marker>
  </defs>

  <!-- Outer Frame -->
  <rect x="8" y="8" width="1424" height="624" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>

  <!-- Academic Header -->
  <g transform="translate(32, 28)">
    <text x="0" y="14" font-size="16" font-weight="800" fill="#0F172A" letter-spacing="0.2px">图 1: R97 系统概览与保语义反混淆流水线</text>
    <text x="380" y="14" font-size="12" font-weight="500" fill="#64748B">Figure 1: R97 System Architecture &amp; Semantic-Preserving Deobfuscation Pipeline</text>
  </g>

  <!-- ========================================================================= -->
  <!-- TOP SECTION: THREE-STAGE PIPELINE (Y: 56, H: 330)                        -->
  <!-- ========================================================================= -->

  <!-- MODULE 1: INPUT & EXTRACTION (Blue Box) -->
  <g transform="translate(32, 56)">
    <rect x="0" y="0" width="310" height="320" rx="8" fill="#F0F7FF" stroke="#3B82F6" stroke-width="1.5" filter="url(#box-shadow)"/>
    
    <!-- Header -->
    <rect x="85" y="10" width="140" height="24" rx="12" fill="#DBEAFE"/>
    <text x="155" y="27" text-anchor="middle" font-size="11.5" font-weight="800" fill="#1D4ED8">① 输入与物证层</text>

    <!-- Sub 1: Code AST -->
    <g transform="translate(14, 46)">
      <rect x="0" y="0" width="282" height="114" rx="6" fill="#FFFFFF" stroke="#BFDBFE" stroke-width="1"/>
      <text x="12" y="20" font-size="10.5" font-weight="700" fill="#0F172A">1) 待分析源码 (AST / Bundle 模块)</text>
      <text x="24" y="42" font-size="9" fill="#475569">• 词法作用域分析与别名递归追踪</text>
      <text x="24" y="62" font-size="9" fill="#475569">• 局部 var 单赋值解绑与宏展开</text>
      <text x="24" y="82" font-size="9" font-weight="700" fill="#2563EB">• 模块闭包拓扑传递 (OBsmith '26)</text>
      <text x="24" y="102" font-size="8.5" fill="#1D4ED8">➔ 提取必需依赖: Required = { definite, pure }</text>
    </g>

    <!-- Sub 2: Physical Evidence -->
    <g transform="translate(14, 172)">
      <rect x="0" y="0" width="282" height="130" rx="6" fill="#FFFFFF" stroke="#BFDBFE" stroke-width="1"/>
      <text x="12" y="20" font-size="10.5" font-weight="700" fill="#0F172A">2) 代码外部客观物证 (Two-Tier)</text>
      <text x="24" y="42" font-size="9" font-weight="700" fill="#334155">• 静态工程配置 (确定代码去哪):</text>
      <text x="32" y="58" font-size="8.5" fill="#64748B">app.json / package.json / index.html</text>
      <text x="24" y="80" font-size="9" font-weight="700" fill="#334155">• 四宿主原生探针 (实测能力在不在):</text>
      <text x="32" y="96" font-size="8.5" font-weight="700" fill="#7C3AED">Node / Edge / 微信快照 / 纯语言基线</text>
      <text x="24" y="116" font-size="8.5" font-weight="700" fill="#0284C7">➔ 证实目标宿主: Target = { confirmed }</text>
    </g>
  </g>

  <!-- Flow Connector 1 -> 2 -->
  <g transform="translate(342, 210)">
    <line x1="0" y1="0" x2="38" y2="0" stroke="#2563EB" stroke-width="2" marker-end="url(#arrow-blue)"/>
    <text x="19" y="-6" text-anchor="middle" font-size="8.5" font-weight="700" fill="#2563EB">输入双端特征</text>
  </g>

  <!-- MODULE 2: R97 GUARD CORE (Amber/Orange Box - Main Focus) -->
  <g transform="translate(380, 56)">
    <rect x="0" y="0" width="680" height="320" rx="8" fill="#FFFDF5" stroke="#F59E0B" stroke-width="1.8" filter="url(#box-shadow)"/>
    
    <!-- Header -->
    <rect x="250" y="10" width="180" height="24" rx="12" fill="#FEF3C7"/>
    <text x="340" y="27" text-anchor="middle" font-size="12" font-weight="900" fill="#B45309">② R97 守门模型 (Guard Core)</text>

    <!-- Sub 2A: Orthogonal Axiom & Contract (Left Sub-column) -->
    <g transform="translate(16, 44)">
      <!-- Core Axiom Box -->
      <rect x="0" y="0" width="310" height="74" rx="6" fill="#FFFBEB" stroke="#FCD34D" stroke-width="1.2"/>
      <text x="12" y="20" font-size="10.5" font-weight="800" fill="#B45309">★ 核心公理: Required ⊥ Target (正交隔离)</text>
      <text x="12" y="38" font-size="8.5" fill="#78350F">• 严禁代码内部自证 (出现 wx 绝不可反推目标是微信!)</text>
      <text x="12" y="54" font-size="8.5" fill="#78350F">• 跨端差异反例检验 (Disparity Check)</text>
      <text x="12" y="68" font-size="8" font-weight="700" fill="#D97706">➔ 支持 [Node + Edge + 微信] 跨端多目标并存</text>

      <!-- Semantic Contract -->
      <g transform="translate(0, 84)">
        <rect x="0" y="0" width="310" height="170" rx="6" fill="#FFFFFF" stroke="#FDE68A" stroke-width="1"/>
        <text x="12" y="20" font-size="10.5" font-weight="700" fill="#0F172A">1) 语义契约投影约束 (Semantic Contract)</text>
        <text x="12" y="38" font-size="8.5" fill="#64748B">按调用上下文动态投影元能力三元组：</text>
        
        <!-- Three Capsules -->
        <g transform="translate(10, 48)">
          <rect x="0" y="0" width="90" height="22" rx="11" fill="#EFF6FF" stroke="#3B82F6" stroke-width="0.8"/>
          <text x="45" y="15" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1D4ED8">existence (存在)</text>

          <rect x="98" y="0" width="86" height="22" rx="11" fill="#EFF6FF" stroke="#3B82F6" stroke-width="0.8"/>
          <text x="141" y="15" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1D4ED8">type (类型)</text>

          <rect x="192" y="0" width="96" height="22" rx="11" fill="#EFF6FF" stroke="#3B82F6" stroke-width="0.8"/>
          <text x="240" y="15" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1D4ED8">callability (调用)</text>
        </g>

        <!-- Stateful Box -->
        <g transform="translate(10, 78)">
          <rect x="0" y="0" width="290" height="48" rx="4" fill="#FFF1F2" stroke="#FECDD3" stroke-width="0.8"/>
          <text x="8" y="16" font-size="8.5" font-weight="700" fill="#9F1239">规范级动态状态与非确定性拦截 (Stateful Guard):</text>
          <text x="8" y="30" font-size="8" fill="#BE123C">• RegExp.$1~$9 / Error.stack 动态可变状态机</text>
          <text x="8" y="42" font-size="8" font-weight="700" fill="#E11D48">• Date.now / Math.random ➔ 确证拦截 (PROTECT)</text>
        </g>

        <text x="12" y="142" font-size="8.5" font-weight="700" fill="#0284C7">比较谓词: strict_equal (多宿主严格等价投影比对)</text>
        <text x="12" y="158" font-size="8" fill="#059669">✓ 纯语言自包含解密函数放行 (Pure Decoder Bypass)</text>
      </g>
    </g>

    <!-- Sub 2B: Eight-Step Decision Engine (Right Sub-column) -->
    <g transform="translate(342, 44)">
      <rect x="0" y="0" width="322" height="254" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
      <text x="12" y="20" font-size="10.5" font-weight="800" fill="#0F172A">2) 安全判定引擎 D(req, target, C, E)</text>

      <!-- Highlight Banner -->
      <g transform="translate(10, 30)">
        <rect x="0" y="0" width="302" height="42" rx="4" fill="#1E293B"/>
        <text x="151" y="16" text-anchor="middle" font-size="8.5" font-weight="800" fill="#38BDF8">
          ★ 实测正向存在冲突优先裁决 (Positive Existence Priority)
        </text>
        <text x="151" y="32" text-anchor="middle" font-size="8" fill="#E2E8F0">
          编译器合成桩延迟挂载隔离 ($gwx/wh ➔ PROTECT, CASCADE '26)
        </text>
      </g>

      <!-- 8-Step Symmetry Grid -->
      <g transform="translate(14, 86)">
        <text x="4" y="16" font-size="8.5" fill="#334155"><tspan font-weight="700">①</tspan> 绑定解析有效性</text>
        <text x="156" y="16" font-size="8.5" font-weight="700" fill="#DC2626"><tspan font-weight="700">⑤</tspan> 宿主全量覆盖判别</text>

        <text x="4" y="36" font-size="8.5" fill="#334155"><tspan font-weight="700">②</tspan> 规范契约完备性</text>
        <text x="156" y="36" font-size="8.5" fill="#334155"><tspan font-weight="700">⑥</tspan> 证据时效与版本校验</text>

        <text x="4" y="56" font-size="8.5" fill="#334155"><tspan font-weight="700">③</tspan> 依赖明确性判定</text>
        <text x="156" y="56" font-size="8.5" font-weight="700" fill="#059669"><tspan font-weight="700">⑦</tspan> 严格多端投影比对</text>

        <text x="4" y="76" font-size="8.5" fill="#334155"><tspan font-weight="700">④</tspan> 目标强证实门槛</text>
        <text x="156" y="76" font-size="8.5" font-weight="700" fill="#2563EB"><tspan font-weight="700">⑧</tspan> 全目标一票否决归约</text>

        <line x1="0" y1="92" x2="294" y2="92" stroke="#E2E8F0" stroke-width="0.8"/>
        <text x="4" y="110" font-size="8.5" font-weight="800" fill="#B45309">
          保全公理: 全目标一致 ➔ FOLD | 差分/正向冲突 ➔ PROTECT
        </text>
        <text x="4" y="128" font-size="8" fill="#64748B">
          多端同构部署严格遵从 combineKnowledgeStates 一票否决安全归约
        </text>
      </g>
    </g>
  </g>

  <!-- Flow Connector 2 -> 3 -->
  <g transform="translate(1060, 210)">
    <line x1="0" y1="0" x2="38" y2="0" stroke="#059669" stroke-width="2" marker-end="url(#arrow-green)"/>
    <text x="19" y="-6" text-anchor="middle" font-size="8.5" font-weight="700" fill="#059669">三态安全出口</text>
  </g>

  <!-- MODULE 3: OUTPUT & VERIFICATION (Green Box) -->
  <g transform="translate(1098, 56)">
    <rect x="0" y="0" width="310" height="320" rx="8" fill="#F0FDF4" stroke="#10B981" stroke-width="1.5" filter="url(#box-shadow)"/>
    
    <!-- Header -->
    <rect x="75" y="10" width="160" height="24" rx="12" fill="#D1FAE5"/>
    <text x="155" y="27" text-anchor="middle" font-size="11.5" font-weight="800" fill="#065F46">③ 决策出口与保证</text>

    <!-- Three Verdict Cards -->
    <g transform="translate(14, 46)">
      <!-- FOLD -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="282" height="38" rx="6" fill="#FFFFFF" stroke="#86EFAC" stroke-width="1"/>
        <rect x="6" y="6" width="46" height="18" rx="4" fill="#059669"/>
        <text x="29" y="19" text-anchor="middle" font-size="8.5" font-weight="900" fill="#FFFFFF">FOLD</text>
        <text x="58" y="18" font-size="9" font-weight="800" fill="#065F46">等价安全放行 (1,531条 / 39.44%)</text>
        <text x="58" y="30" font-size="7.5" fill="#047857">纯语言闭包/多端严格一致 ➔ 授权折叠</text>
      </g>

      <!-- PROTECT -->
      <g transform="translate(0, 44)">
        <rect x="0" y="0" width="282" height="38" rx="6" fill="#FFFFFF" stroke="#FECDD3" stroke-width="1"/>
        <rect x="6" y="6" width="58" height="18" rx="4" fill="#DC2626"/>
        <text x="35" y="19" text-anchor="middle" font-size="8.5" font-weight="900" fill="#FFFFFF">PROTECT</text>
        <text x="70" y="18" font-size="9" font-weight="800" fill="#9F1239">冲突硬拦截 (1,466条 / 37.76%)</text>
        <text x="70" y="30" font-size="7.5" fill="#BE123C">实测差分/状态内建/合成桩 ➔ 强制锁死！</text>
      </g>

      <!-- UNKNOWN -->
      <g transform="translate(0, 88)">
        <rect x="0" y="0" width="282" height="38" rx="6" fill="#FFFFFF" stroke="#FDE68A" stroke-width="1"/>
        <rect x="6" y="6" width="58" height="18" rx="4" fill="#D97706"/>
        <text x="35" y="19" text-anchor="middle" font-size="8.5" font-weight="900" fill="#FFFFFF">UNKNOWN</text>
        <text x="70" y="18" font-size="9" font-weight="800" fill="#92400E">保守安全未决 (885条 / 22.80%)</text>
        <text x="70" y="30" font-size="7.5" fill="#78350F">dropAbsence(68条)/零信任兜底 ➔ 保守不折</text>
      </g>
    </g>

    <!-- Double-Oracle Mini Box -->
    <g transform="translate(14, 180)">
      <rect x="0" y="0" width="282" height="122" rx="6" fill="#FFFFFF" stroke="#86EFAC" stroke-width="1"/>
      <text x="10" y="18" font-size="9.5" font-weight="800" fill="#15803D">双重验证闭环 (Double-Oracle)</text>
      <text x="10" y="34" font-size="8" fill="#166534">• Level-1: 静态契约 + 原型代理安全反射 (规避卡死)</text>
      <text x="10" y="48" font-size="8" fill="#166534">• Level-2: 动态多端轨迹比对 P ≈_E Q (OBsmith §3.4)</text>

      <rect x="8" y="60" width="266" height="52" rx="4" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
      <text x="14" y="78" font-size="10.5" font-weight="900" fill="#065F46">✅ 可判定率 77.20% (加权最优)</text>
      <text x="14" y="94" font-size="9" font-weight="800" fill="#059669">在 782 条跨端实测差异上：实测 0 误放行！</text>
      <text x="14" y="105" font-size="7.5" fill="#15803D">保语义代码优化，零不安全折叠保证</text>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- BOTTOM SECTION: CODE TRANSFORMATION EVOLUTION EXAMPLE (Y: 396, H: 220)    -->
  <!-- ========================================================================= -->
  <line x1="32" y1="392" x2="1408" y2="392" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="5 4"/>
  <rect x="32" y="380" width="130" height="22" rx="4" fill="#334155"/>
  <text x="97" y="395" text-anchor="middle" font-size="10" font-weight="700" fill="#FFFFFF">代码转换与保护示例</text>

  <!-- Step 1: Raw Obfuscated Code Box -->
  <g transform="translate(32, 410)">
    <rect x="0" y="0" width="280" height="175" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
    <text x="12" y="20" font-size="9.5" font-weight="800" fill="#334155">[阶段 0] 原始混淆代码 (Input)</text>
    <rect x="8" y="28" width="264" height="138" rx="4" fill="#0F172A"/>
    <text x="16" y="46" font-family="monospace" font-size="8" fill="#94A3B8">// 字符串数组加密 + 小程序分支</text>
    <text x="16" y="60" font-family="monospace" font-size="8" fill="#38BDF8">var _0x4a = ['request', 'undefined'];</text>
    <text x="16" y="74" font-family="monospace" font-size="8" fill="#FCD34D">var val = 1 + 2 + 3;</text>
    <text x="16" y="88" font-family="monospace" font-size="8" fill="#F43F5E">if (typeof wx !== _0x4a[1]) {</text>
    <text x="24" y="102" font-family="monospace" font-size="8" fill="#F43F5E">  wx[_0x4a[0]]({ url: '/pay' });</text>
    <text x="16" y="116" font-family="monospace" font-size="8" fill="#F43F5E">}</text>
    <text x="16" y="130" font-family="monospace" font-size="8" fill="#38BDF8">var time = Date.now();</text>
    <text x="16" y="152" font-size="7.5" fill="#94A3B8">待去混淆与常量折叠 ➔</text>
  </g>

  <!-- Arrow 1 -> 2 -->
  <g transform="translate(318, 490)">
    <line x1="0" y1="0" x2="36" y2="0" stroke="#64748B" stroke-width="1.5" marker-end="url(#arrow-gray)"/>
    <text x="18" y="-6" text-anchor="middle" font-size="8" fill="#64748B">反混淆</text>
  </g>

  <!-- Step 2: Traditional Obfuscator Failure Box (RED WARNING) -->
  <g transform="translate(360, 410)">
    <rect x="0" y="0" width="460" height="175" rx="6" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2"/>
    <rect x="8" y="8" width="130" height="18" rx="4" fill="#E11D48"/>
    <text x="73" y="21" text-anchor="middle" font-size="8.5" font-weight="800" fill="#FFFFFF">传统反混淆工具 (无 R97)</text>
    
    <g transform="translate(10, 32)">
      <rect x="0" y="0" width="440" height="88" rx="4" fill="#1E293B"/>
      <text x="10" y="18" font-family="monospace" font-size="8" fill="#64748B">// 纯常量折叠成功:</text>
      <text x="10" y="32" font-family="monospace" font-size="8" fill="#FCD34D">var val = 6;</text>
      <text x="10" y="46" font-family="monospace" font-size="8" fill="#FDA4AF">// 💥 离线 Node 求值误判 typeof wx 为 "undefined"!</text>
      <text x="10" y="60" font-family="monospace" font-size="8" fill="#FDA4AF">// 死代码消除将整个微信支付分支物理抹除 (Dead Code Pruning)!</text>
      <text x="10" y="76" font-family="monospace" font-size="8" fill="#FDA4AF">var time = 1760000000000; // 动态时钟被死锁为假常量</text>

      <rect x="0" y="96" width="440" height="38" rx="4" fill="#FFE4E6"/>
      <text x="10" y="112" font-size="8.5" font-weight="900" fill="#BE123C">💥 目标真机运行时崩溃！(100% 致命破坏)</text>
      <text x="10" y="126" font-size="7.5" fill="#9F1239">核心能力丢失，真机执行报 TypeError / 白屏死锁！</text>
    </g>
  </g>

  <!-- Arrow 2 -> 3 -->
  <g transform="translate(826, 490)">
    <line x1="0" y1="0" x2="36" y2="0" stroke="#059669" stroke-width="2" marker-end="url(#arrow-green)"/>
    <text x="18" y="-6" text-anchor="middle" font-size="8.5" font-weight="800" fill="#059669">R97 守门</text>
  </g>

  <!-- Step 3: R97 Guarded Output Box (GREEN SUCCESS) -->
  <g transform="translate(868, 410)">
    <rect x="0" y="0" width="540" height="175" rx="6" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1.5"/>
    <rect x="8" y="8" width="130" height="18" rx="4" fill="#059669"/>
    <text x="73" y="21" text-anchor="middle" font-size="8.5" font-weight="800" fill="#FFFFFF">集成 R97 守门保护器</text>

    <g transform="translate(10, 32)">
      <rect x="0" y="0" width="520" height="88" rx="4" fill="#064E3B"/>
      <text x="10" y="18" font-family="monospace" font-size="8" fill="#6EE7B7">// 1. 纯语言计算正常享受常量折叠优化:</text>
      <text x="10" y="32" font-family="monospace" font-size="8" fill="#FCD34D">var val = 6;</text>
      <text x="10" y="46" font-family="monospace" font-size="8" fill="#6EE7B7">// 2. R97 两阶段接力: 字符串成功解密，宿主敏感分支 100% 完整保留!</text>
      <text x="10" y="60" font-family="monospace" font-size="8" fill="#34D399">if (typeof wx !== "undefined") { wx.request({ url: '/pay' }); }</text>
      <text x="10" y="74" font-family="monospace" font-size="8" fill="#6EE7B7">var time = Date.now(); // 动态状态公理拦截，保留动态时钟</text>

      <rect x="0" y="96" width="520" height="38" rx="4" fill="#DCFCE7"/>
      <text x="10" y="112" font-size="8.5" font-weight="900" fill="#065F46">✅ 跨宿主部署 100% 正常运行！(0 崩溃，0 误放行)</text>
      <text x="10" y="126" font-size="7.5" fill="#047857">既享受了 39.44% 的常量优化效用，又彻底捍卫了原程序语义保真！</text>
    </g>
  </g>

  <!-- Bottom Design Principles Bar -->
  <g transform="translate(32, 595)">
    <rect x="0" y="0" width="1376" height="28" rx="4" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="16" y="18" font-size="8.5" font-weight="800" fill="#0F172A">设计原则 (Design Principles):</text>
    <text x="156" y="18" font-size="8" fill="#475569">
      [1] 三域生态覆盖 (Web/Node/小程序)； [2] 需求与目标正交隔离 (Required ⊥ Target)； [3] 契约元能力降维； [4] 模块闭包自底向上拓扑传递； [5] Double-Oracle 双重闭环验证； [6] 100% 守住零误放行安全底线。
    </text>
  </g>
</svg>
'''

out_svg = "docs/r97_minimalist_framework.svg"
out_html = "docs/r97_minimalist_framework.html"
out_png = "docs/r97_minimalist_framework.png"
out_pdf = "docs/r97_minimalist_framework.pdf"

with open(out_svg, "w", encoding="utf-8") as f:
    f.write(svg_content)
print("Saved", out_svg)

html_wrap = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{{size:1440px 640px;margin:0;}}*{{margin:0;padding:0;box-sizing:border-box;}}body{{background:#fff;width:1440px;height:640px;overflow:hidden;}}svg{{display:block;}}</style></head><body>{svg_content}</body></html>'''
with open(out_html, "w", encoding="utf-8") as f:
    f.write(html_wrap)
print("Saved", out_html)

# Render to PNG & PDF using Edge headless
edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
html_abs = os.path.abspath(out_html)
png_abs = os.path.abspath(out_png)
pdf_abs = os.path.abspath(out_pdf)

if os.path.exists(edge_path):
    cmd_png = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        "--force-device-scale-factor=2.5",
        "--window-size=1440,640",
        f"--screenshot={png_abs}",
        f"file:///{html_abs.replace(os.sep, '/')}"
    ]
    subprocess.run(cmd_png, capture_output=True)

    cmd_pdf = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_abs}",
        f"file:///{html_abs.replace(os.sep, '/')}"
    ]
    subprocess.run(cmd_pdf, capture_output=True)

    if os.path.exists(png_abs):
        print("PNG generated:", os.path.getsize(png_abs), "bytes")
    if os.path.exists(pdf_abs):
        print("PDF generated:", os.path.getsize(pdf_abs), "bytes")
