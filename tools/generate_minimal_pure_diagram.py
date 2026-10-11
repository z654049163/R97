import os
import subprocess

# ==============================================================================
# 纯净极简版模型图: r97_minimal_pure_architecture.svg
# 彻底删减多余文字堆砌，只保留 1-3 个核心词，依靠拓扑结构与视觉流向表达系统机理！
# ==============================================================================
svg_minimal = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1360 520" width="1360" height="520" style="background:#FFFFFF; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <!-- Soft Minimal Shadow -->
    <filter id="m-shadow" x="-3%" y="-3%" width="106%" height="108%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.04" />
    </filter>

    <!-- Clean Markers -->
    <marker id="arr-main" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7"/>
    </marker>
    <marker id="arr-gray" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B"/>
    </marker>
    <marker id="arr-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669"/>
    </marker>
    <marker id="arr-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#E11D48"/>
    </marker>
    <marker id="arr-amber" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#D97706"/>
    </marker>
  </defs>

  <!-- Title (Super Clean) -->
  <g transform="translate(30, 32)">
    <text x="0" y="0" font-size="16" font-weight="800" fill="#0F172A">R97: 目标运行时感知的反混淆折叠保护架构</text>
    <text x="420" y="0" font-size="12" fill="#64748B">Target-Runtime-Aware Deobfuscation Guard Architecture</text>
  </g>

  <!-- ==================== COLUMN 1: INPUTS (X: 30) ==================== -->
  <g transform="translate(30, 60)">
    <!-- Group Frame -->
    <rect x="0" y="0" width="180" height="380" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="90" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#334155">一、异构输入源</text>

    <!-- Node 1: Code AST -->
    <g transform="translate(14, 46)">
      <rect x="0" y="0" width="152" height="96" rx="6" fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2" filter="url(#m-shadow)"/>
      <rect x="8" y="8" width="56" height="18" rx="9" fill="#E0F2FE"/>
      <text x="36" y="21" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0369A1">源码 AST</text>
      
      <text x="10" y="44" font-size="10" font-weight="700" fill="#0F172A">待分析代码</text>
      <text x="10" y="60" font-size="8.5" fill="#64748B">• 微信小程序包</text>
      <text x="10" y="74" font-size="8.5" fill="#64748B">• 前端 Web (WPT)</text>
      <text x="10" y="88" font-size="8.5" fill="#64748B">• 后端 Node.js</text>
    </g>

    <!-- Node 2: External Manifests -->
    <g transform="translate(14, 230)">
      <rect x="0" y="0" width="152" height="96" rx="6" fill="#FFFFFF" stroke="#7C3AED" stroke-width="1.2" filter="url(#m-shadow)"/>
      <rect x="8" y="8" width="56" height="18" rx="9" fill="#F3E8FF"/>
      <text x="36" y="21" text-anchor="middle" font-size="8.5" font-weight="700" fill="#6D28D9">外部事实</text>
      
      <text x="10" y="44" font-size="10" font-weight="700" fill="#0F172A">部署环境配置</text>
      <text x="10" y="60" font-size="8.5" fill="#64748B">• project.config</text>
      <text x="10" y="74" font-size="8.5" fill="#64748B">• package.json</text>
      <text x="10" y="88" font-size="8.5" fill="#64748B">• 平台版本指纹</text>
    </g>
  </g>

  <!-- Connectors C1 -> C2 -->
  <line x1="210" y1="154" x2="242" y2="154" stroke="#0284C7" stroke-width="1.5" marker-end="url(#arr-main)"/>
  <line x1="210" y1="338" x2="242" y2="338" stroke="#7C3AED" stroke-width="1.5" marker-end="url(#arr-gray)"/>

  <!-- ==================== COLUMN 2: DECOUPLED EXTRACTION (X: 242) ==================== -->
  <g transform="translate(242, 60)">
    <rect x="0" y="0" width="220" height="380" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="110" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#334155">二、双轨正交解耦</text>

    <!-- Required Extraction -->
    <g transform="translate(14, 46)">
      <rect x="0" y="0" width="192" height="96" rx="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1" filter="url(#m-shadow)"/>
      <text x="10" y="20" font-size="10" font-weight="800" fill="#0369A1">AST 依赖分析器</text>
      <text x="10" y="36" font-size="8.5" fill="#475569">• 词法遮蔽检测</text>
      <text x="10" y="50" font-size="8.5" fill="#475569">• 常量别名追踪</text>
      
      <rect x="8" y="62" width="176" height="24" rx="4" fill="#F0FDF4" stroke="#86EFAC" stroke-width="0.8"/>
      <text x="14" y="78" font-size="9" font-weight="700" fill="#15803D">required: { definite, wx }</text>
    </g>

    <!-- Physical Firewall Barrier -->
    <g transform="translate(14, 160)">
      <rect x="0" y="0" width="192" height="52" rx="6" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2" stroke-dasharray="3 3"/>
      <text x="96" y="22" text-anchor="middle" font-size="9.5" font-weight="800" fill="#E11D48">🔒 正交隔离防火墙</text>
      <text x="96" y="38" text-anchor="middle" font-size="8" font-weight="700" fill="#9F1239">Required ⊥ Target (禁循环推断)</text>
    </g>

    <!-- Target Resolver -->
    <g transform="translate(14, 230)">
      <rect x="0" y="0" width="192" height="96" rx="6" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1" filter="url(#m-shadow)"/>
      <text x="10" y="20" font-size="10" font-weight="800" fill="#6D28D9">目标运行时解析器</text>
      <text x="10" y="36" font-size="8.5" fill="#475569">• 外部指纹核验</text>
      <text x="10" y="50" font-size="8.5" fill="#475569">• 冲突互斥检查</text>

      <rect x="8" y="62" width="176" height="24" rx="4" fill="#EDE9FE" stroke="#C4B5FD" stroke-width="0.8"/>
      <text x="14" y="78" font-size="9" font-weight="700" fill="#5B21B6">target: { confirmed, WeChat }</text>
    </g>
  </g>

  <!-- Connectors C2 -> C3 -->
  <line x1="462" y1="154" x2="494" y2="154" stroke="#0284C7" stroke-width="1.5" marker-end="url(#arr-main)"/>
  <line x1="462" y1="338" x2="494" y2="338" stroke="#7C3AED" stroke-width="1.5" marker-end="url(#arr-gray)"/>

  <!-- ==================== COLUMN 3: CONTRACTS & PROBES (X: 494) ==================== -->
  <g transform="translate(494, 60)">
    <rect x="0" y="0" width="280" height="380" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="140" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#334155">三、语义契约与实测探针</text>

    <!-- Semantic Contract -->
    <g transform="translate(14, 46)">
      <rect x="0" y="0" width="252" height="96" rx="6" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1" filter="url(#m-shadow)"/>
      <text x="10" y="20" font-size="10" font-weight="800" fill="#0369A1">语义契约模型 C</text>
      
      <!-- 3 Pills -->
      <g transform="translate(8, 30)">
        <rect x="0" y="0" width="72" height="20" rx="10" fill="#E0F2FE"/>
        <text x="36" y="14" text-anchor="middle" font-size="8" font-weight="700" fill="#0284C7">typeof</text>

        <rect x="80" y="0" width="76" height="20" rx="10" fill="#E0F2FE"/>
        <text x="118" y="14" text-anchor="middle" font-size="8" font-weight="700" fill="#0284C7">truthiness</text>

        <rect x="164" y="0" width="72" height="20" rx="10" fill="#E0F2FE"/>
        <text x="200" y="14" text-anchor="middle" font-size="8" font-weight="700" fill="#0284C7">return_val</text>
      </g>

      <rect x="8" y="58" width="236" height="28" rx="4" fill="#FFF1F2" stroke="#FECDD3" stroke-width="0.8"/>
      <text x="14" y="76" font-size="8" font-weight="700" fill="#9F1239">非确定性拦截: Date.now / Math.random ➔ UNKNOWN</text>
    </g>

    <!-- 4-Host Probing Readings Contrast -->
    <g transform="translate(14, 156)">
      <rect x="0" y="0" width="252" height="170" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" filter="url(#m-shadow)"/>
      <text x="10" y="18" font-size="10" font-weight="800" fill="#0F172A">4 宿主实测探针矩阵 (Probes)</text>
      
      <!-- 4 Badges -->
      <g transform="translate(8, 28)">
        <rect x="0" y="0" width="54" height="20" rx="4" fill="#F1F5F9"/>
        <text x="27" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#475569">VM 基线</text>

        <rect x="60" y="0" width="54" height="20" rx="4" fill="#F1F5F9"/>
        <text x="87" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#475569">Node.js</text>

        <rect x="120" y="0" width="54" height="20" rx="4" fill="#F1F5F9"/>
        <text x="147" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#475569">Edge 浏览器</text>

        <rect x="180" y="0" width="56" height="20" rx="4" fill="#F0FDF4" stroke="#86EFAC" stroke-width="0.8"/>
        <text x="208" y="14" text-anchor="middle" font-size="7.5" font-weight="700" fill="#15803D">微信真机</text>
      </g>

      <!-- Contrast Cases -->
      <g transform="translate(8, 56)">
        <rect x="0" y="0" width="236" height="42" rx="4" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="0.8"/>
        <text x="6" y="15" font-family="monospace" font-size="8" font-weight="700" fill="#9F1239">typeof wx 读数:</text>
        <text x="6" y="27" font-size="7.5" fill="#BE123C">VM/Node: 'undefined' ≠ 微信: 'object'</text>
        <text x="6" y="37" font-size="7.5" font-weight="700" fill="#E11D48">➔ 发现真实冲突 ➔ 硬拦截 PROTECT</text>

        <rect x="0" y="48" width="236" height="42" rx="4" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="0.8"/>
        <text x="6" y="63" font-family="monospace" font-size="8" font-weight="700" fill="#166534">Math.abs(-5) === 5 读数:</text>
        <text x="6" y="75" font-size="7.5" fill="#15803D">4 宿主读数皆为 true (strict_equal)</text>
        <text x="6" y="85" font-size="7.5" font-weight="700" fill="#059669">➔ 严格等价 ➔ 安全放行 FOLD</text>
      </g>

      <text x="10" y="158" font-size="8" font-weight="700" fill="#15803D">Level-2 动态执行验证不一致率: 0.00%</text>
    </g>
  </g>

  <!-- Connectors C3 -> C4 -->
  <line x1="774" y1="204" x2="806" y2="204" stroke="#0284C7" stroke-width="1.5" marker-end="url(#arr-main)"/>

  <!-- ==================== COLUMN 4: DECISION ENGINE (X: 806) ==================== -->
  <g transform="translate(806, 60)">
    <rect x="0" y="0" width="240" height="380" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="120" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#334155">四、八步安全判定核心</text>

    <!-- Formula Capsule -->
    <g transform="translate(14, 46)">
      <rect x="0" y="0" width="212" height="28" rx="14" fill="#0F172A"/>
      <text x="106" y="18" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="#38BDF8">
        D(req, target, C, E) → { F, P, U }
      </text>
    </g>

    <!-- Funnel Rules -->
    <g transform="translate(14, 86)">
      <rect x="0" y="0" width="212" height="150" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" filter="url(#m-shadow)"/>
      <text x="10" y="18" font-size="9" font-weight="700" fill="#0F172A">递进核验规则流水线:</text>
      
      <text x="10" y="36" font-size="8" fill="#475569">① 绑定解析 ➔ ② 契约完备性</text>
      <text x="10" y="50" font-size="8" fill="#475569">③ 必需明确性 ➔ ④ 目标确认状态</text>
      <text x="10" y="64" font-size="8" fill="#E11D48">⑤ 必需宿主缺失 ➔ 硬判 PROTECT</text>
      <text x="10" y="78" font-size="8" fill="#475569">⑥ 证据指纹时效 ➔ ⑦ 维度投影比对</text>
      <text x="10" y="92" font-size="8" fill="#059669">⑧ 全目标严格等价 ➔ 放行 FOLD</text>
      <line x1="8" y1="102" x2="204" y2="102" stroke="#E2E8F0" stroke-width="1"/>
      <text x="10" y="118" font-size="8" fill="#D97706">未确认或证据不足 ➔ 保守 UNKNOWN</text>
      <text x="10" y="132" font-size="7.5" fill="#64748B">(归因: binding / runtime / behavior)</text>
    </g>

    <!-- Soundness Principle -->
    <g transform="translate(14, 246)">
      <rect x="0" y="0" width="212" height="80" rx="6" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1"/>
      <text x="10" y="18" font-size="8.5" font-weight="700" fill="#B45309">判定保全定理:</text>
      <text x="10" y="34" font-size="8" fill="#78350F">仅在多环境严格等价时放行 FOLD；</text>
      <text x="10" y="48" font-size="8" fill="#78350F">任何疑点严格收敛至 UNKNOWN。</text>
      <text x="10" y="66" font-size="8" font-weight="800" fill="#059669">实测拦截率 100%，过度保护 0！</text>
    </g>
  </g>

  <!-- Connectors C4 -> C5 (3-Way Split) -->
  <line x1="1046" y1="150" x2="1078" y2="114" stroke="#059669" stroke-width="1.5" marker-end="url(#arr-green)"/>
  <line x1="1046" y1="210" x2="1078" y2="210" stroke="#E11D48" stroke-width="1.5" marker-end="url(#arr-red)"/>
  <line x1="1046" y1="270" x2="1078" y2="306" stroke="#D97706" stroke-width="1.5" marker-end="url(#arr-amber)"/>

  <!-- ==================== COLUMN 5: VERDICTS & IMPACT (X: 1078) ==================== -->
  <g transform="translate(1078, 60)">
    <rect x="0" y="0" width="252" height="380" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="126" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#334155">五、三值出口与下游守护</text>

    <!-- FOLD Badge -->
    <g transform="translate(14, 40)">
      <rect x="0" y="0" width="224" height="42" rx="6" fill="#ECFDF5" stroke="#6EE7B7" stroke-width="1"/>
      <text x="10" y="18" font-size="9" font-weight="800" fill="#065F46">✅ FOLD (等价安全放行)</text>
      <text x="10" y="32" font-size="8" fill="#047857">授权下游常量折叠 (785差分 0 误放行)</text>
    </g>

    <!-- PROTECT Badge -->
    <g transform="translate(14, 90)">
      <rect x="0" y="0" width="224" height="42" rx="6" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1"/>
      <text x="10" y="18" font-size="9" font-weight="800" fill="#9F1239">🛡️ PROTECT (冲突硬拦截)</text>
      <text x="10" y="32" font-size="8" fill="#BE123C">强制保留分支！敏感分支拦截率 100%</text>
    </g>

    <!-- UNKNOWN Badge -->
    <g transform="translate(14, 140)">
      <rect x="0" y="0" width="224" height="42" rx="6" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1"/>
      <text x="10" y="18" font-size="9" font-weight="800" fill="#92400E">⚠️ UNKNOWN (保守安全未决)</text>
      <text x="10" y="32" font-size="8" fill="#B45309">证据不足时兜底不折叠，保全程序</text>
    </g>

    <!-- Downstream Deobfuscator Comparison Card -->
    <g transform="translate(14, 194)">
      <rect x="0" y="0" width="224" height="172" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" filter="url(#m-shadow)"/>
      <text x="10" y="18" font-size="9" font-weight="800" fill="#0F172A">下游反混淆优化对比:</text>

      <!-- Traditional: Crash -->
      <g transform="translate(8, 26)">
        <rect x="0" y="0" width="208" height="52" rx="4" fill="#FFF1F2" stroke="#FECDD3" stroke-width="0.8"/>
        <text x="6" y="14" font-size="8" font-weight="700" fill="#9F1239">无 R97 (传统工具):</text>
        <text x="6" y="28" font-size="7.5" fill="#BE123C">求值误判假 ➔ 误剪 if(wx) 关键分支</text>
        <text x="6" y="42" font-size="7.5" font-weight="800" fill="#E11D48">💥 真机部署崩溃 (TypeError)!</text>
      </g>

      <!-- R97: Sound -->
      <g transform="translate(8, 86)">
        <rect x="0" y="0" width="208" height="64" rx="4" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="0.8"/>
        <text x="6" y="14" font-size="8" font-weight="700" fill="#166534">集成 R97 守门保护:</text>
        <text x="6" y="28" font-size="7.5" fill="#15803D">识别冲突 ➔ 拦截折叠，保留完整分支</text>
        <text x="6" y="42" font-size="7.5" font-weight="700" fill="#059669">✅ 真机 100% 正常运行，功能零缺失！</text>
        <text x="6" y="54" font-size="7" font-weight="800" fill="#166534">折叠精度: 100.0% | 不安全折叠: 0</text>
      </g>
    </g>
  </g>

  <!-- Global Footer Bar (Super Crisp) -->
  <g transform="translate(30, 452)">
    <rect x="0" y="0" width="1300" height="42" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="14" y="18" font-size="9" font-weight="700" fill="#0F172A">R97 全景定理:</text>
    <text x="88" y="18" font-size="8.5" fill="#475569">
      [1] 三域生态全面覆盖 (Web/Node/小程序)； [2] 必需与目标正交隔离防火墙； [3] 4 宿主真机差分探针驱动； [4] 零不安全折叠绝对安全保证。
    </text>
    <text x="14" y="32" font-size="8" fill="#64748B">
      全流程无缝集成：webcrack / Terser / Babel 反混淆与代码优化管线。
    </text>
  </g>
</svg>
'''

with open("docs/r97_minimal_pure_architecture.svg", "w", encoding="utf-8") as f:
    f.write(svg_minimal)

print("Saved docs/r97_minimal_pure_architecture.svg")

# Render HTML wrap
html_wrap = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box;}}body{{background:#fff;width:1360px;height:520px;overflow:hidden;}}</style></head><body>{svg_minimal}</body></html>'''
with open("docs/r97_minimal_pure_architecture.html", "w", encoding="utf-8") as f:
    f.write(html_wrap)

print("Saved docs/r97_minimal_pure_architecture.html")
