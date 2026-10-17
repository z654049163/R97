import os
import subprocess

# ==============================================================================
# R97 极简高雅架构概览图 (彻底解决臃肿 - 去除层层嵌套框，留白呼吸透亮)
# 排版哲学:
# 1. 彻底去嵌套框 (De-boxing): 杜绝框中套框、盒中套盒，直接用通透底色加轻量卡片
# 2. 核心短语极致凝练: 4-6 个字，无任何琐碎副标题
# 3. 双轨解耦流极简呈现: 1)词法 -> 2)别名 -> 3)闭包 -> Required / 4)配置 -> 5)探针 -> Target
# ==============================================================================

svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 480" width="1200" height="480" style="background:#FFFFFF; font-family:'Microsoft YaHei', 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <defs>
    <!-- Connectors -->
    <marker id="arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569"/>
    </marker>
    <marker id="arr-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7"/>
    </marker>
    <marker id="arr-orange" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#EA580C"/>
    </marker>
    <marker id="arr-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#16A34A"/>
    </marker>
  </defs>

  <!-- Canvas Border -->
  <rect x="6" y="6" width="1188" height="468" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>

  <!-- Top Title -->
  <g transform="translate(24, 26)">
    <text x="0" y="14" font-size="15" font-weight="800" fill="#0F172A" letter-spacing="0.2px">图 1: R97 系统概览与保语义反混淆流水线</text>
    <text x="350" y="14" font-size="11.5" font-weight="500" fill="#64748B">Figure 1: R97 System Architecture &amp; Semantic-Preserving Deobfuscation Pipeline</text>
  </g>

  <!-- ========================================================================= -->
  <!-- TOP PIPELINE: THREE CORE MODULES (Y: 52, H: 225)                          -->
  <!-- ========================================================================= -->

  <!-- Left Input Label -->
  <g transform="translate(14, 115)">
    <rect x="16" y="0" width="28" height="34" rx="3" fill="#F8FAFC" stroke="#64748B" stroke-width="1.2"/>
    <line x1="22" y1="8" x2="36" y2="8" stroke="#64748B" stroke-width="1"/>
    <line x1="22" y1="14" x2="38" y2="14" stroke="#64748B" stroke-width="1"/>
    <line x1="22" y1="20" x2="32" y2="20" stroke="#64748B" stroke-width="1"/>
    <text x="30" y="50" text-anchor="middle" font-size="9.5" font-weight="700" fill="#DC2626">待分析的</text>
    <text x="30" y="63" text-anchor="middle" font-size="9.5" font-weight="700" fill="#DC2626">JavaScript 代码</text>
  </g>

  <!-- Arrow Input -> Module 1 -->
  <line x1="80" y1="135" x2="104" y2="135" stroke="#475569" stroke-width="1.4" marker-end="url(#arr)"/>

  <!-- ==================== MODULE 1: ① 特征解耦器 (Clean Airy Blue Box) ==================== -->
  <g transform="translate(106, 52)">
    <rect x="0" y="0" width="286" height="218" rx="6" fill="#F0F9FF" stroke="#0284C7" stroke-width="1.5"/>
    <text x="143" y="24" text-anchor="middle" font-size="12" font-weight="800" fill="#0369A1">① 双端特征解耦器</text>

    <!-- Track A: Code-Side Stream (Clean, No Box-in-Box) -->
    <g transform="translate(12, 38)">
      <text x="4" y="12" font-size="9.5" font-weight="800" fill="#0369A1">代码侧依赖推导 (Code):</text>
      
      <!-- Flow: 1 -> 2 -> 3 -->
      <g transform="translate(4, 22)">
        <rect x="0" y="0" width="70" height="26" rx="4" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
        <text x="35" y="17" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0F172A">1) 词法分析</text>

        <line x1="70" y1="13" x2="84" y2="13" stroke="#0284C7" stroke-width="1" marker-end="url(#arr-blue)"/>

        <rect x="88" y="0" width="70" height="26" rx="4" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
        <text x="123" y="17" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0F172A">2) 别名追踪</text>

        <line x1="158" y1="13" x2="172" y2="13" stroke="#0284C7" stroke-width="1" marker-end="url(#arr-blue)"/>

        <rect x="176" y="0" width="70" height="26" rx="4" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
        <text x="211" y="17" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0F172A">3) 闭包传递</text>
      </g>
      <text x="131" y="60" text-anchor="middle" font-size="8" font-weight="800" fill="#0284C7">(wx.request, definite) | (window, pure)</text>
    </g>

    <!-- Axiom Separator (Elegant Single Line Banner) -->
    <g transform="translate(12, 108)">
      <rect x="0" y="0" width="262" height="22" rx="3" fill="#FFFBEB" stroke="#FCD34D" stroke-width="1"/>
      <text x="131" y="15" text-anchor="middle" font-size="8.5" font-weight="900" fill="#B45309">
        ★ Required ⊥ Target (正交隔离公理)
      </text>
    </g>

    <!-- Track B: Evidence-Side Stream (Clean, No Box-in-Box) -->
    <g transform="translate(12, 138)">
      <text x="4" y="12" font-size="9.5" font-weight="800" fill="#6D28D9">证据侧目标证实 (Evidence):</text>
      
      <!-- Flow: 4 -> 5 -->
      <g transform="translate(16, 22)">
        <rect x="0" y="0" width="100" height="26" rx="4" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1"/>
        <text x="50" y="17" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0F172A">4) 工程配置解析</text>

        <line x1="100" y1="13" x2="120" y2="13" stroke="#7C3AED" stroke-width="1" marker-end="url(#arr-blue)"/>

        <rect x="124" y="0" width="100" height="26" rx="4" fill="#FFFFFF" stroke="#DDD6FE" stroke-width="1"/>
        <text x="174" y="17" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0F172A">5) 四宿主探针校验</text>
      </g>
      <text x="131" y="60" text-anchor="middle" font-size="8" font-weight="800" fill="#6D28D9">(WeChat, confirmed) | (Node, corroborated)</text>
    </g>
  </g>

  <!-- Arrow Module 1 -> Module 2 -->
  <line x1="392" y1="161" x2="422" y2="161" stroke="#475569" stroke-width="1.6" marker-end="url(#arr)"/>

  <!-- ==================== MODULE 2: ② 守门模型 (Clean Orange Box) ==================== -->
  <g transform="translate(424, 52)">
    <rect x="0" y="0" width="466" height="218" rx="6" fill="#FFFDF5" stroke="#EA580C" stroke-width="1.8"/>
    <text x="233" y="24" text-anchor="middle" font-size="13" font-weight="900" fill="#C2410C">② 守门模型 (Guard Core)</text>

    <!-- Sub 1: 契约与状态机 (Left) -->
    <g transform="translate(14, 38)">
      <rect x="0" y="0" width="210" height="116" rx="4" fill="#FFFFFF" stroke="#FED7AA" stroke-width="1"/>
      <text x="105" y="16" text-anchor="middle" font-size="9.5" font-weight="800" fill="#9A3412">1) 静态语义契约约束</text>
      
      <!-- Pills -->
      <g transform="translate(8, 26)">
        <rect x="0" y="0" width="60" height="18" rx="9" fill="#EFF6FF" stroke="#3B82F6" stroke-width="0.8"/>
        <text x="30" y="13" text-anchor="middle" font-size="7.5" fill="#1D4ED8">existence</text>

        <rect x="65" y="0" width="52" height="18" rx="9" fill="#EFF6FF" stroke="#3B82F6" stroke-width="0.8"/>
        <text x="91" y="13" text-anchor="middle" font-size="7.5" fill="#1D4ED8">type</text>

        <rect x="122" y="0" width="64" height="18" rx="9" fill="#EFF6FF" stroke="#3B82F6" stroke-width="0.8"/>
        <text x="154" y="13" text-anchor="middle" font-size="7.5" fill="#1D4ED8">callability</text>
      </g>

      <g transform="translate(10, 56)">
        <text x="0" y="12" font-size="8" font-weight="700" fill="#334155">规范状态机拦截 (PROTECT):</text>
        <text x="8" y="26" font-size="7.5" fill="#B91C1C">• RegExp.$1~$9 / Error.stack</text>
        <text x="8" y="38" font-size="7.5" fill="#B91C1C">• Date.now() / Math.random()</text>
        <text x="0" y="52" font-size="7.5" fill="#047857">✓ 纯语言解密器放行 (Pure Bypass)</text>
      </g>
    </g>

    <!-- Sub 2: 动态多宿主监控 (Right) -->
    <g transform="translate(240, 38)">
      <rect x="0" y="0" width="212" height="116" rx="4" fill="#FFFFFF" stroke="#FED7AA" stroke-width="1"/>
      <text x="106" y="16" text-anchor="middle" font-size="9.5" font-weight="800" fill="#9A3412">2) 真实环境探针监控</text>

      <g transform="translate(10, 26)">
        <text x="0" y="12" font-size="8" font-weight="700" fill="#334155">四宿主物理探针:</text>
        <text x="8" y="25" font-size="7.5" fill="#475569">• Node / Edge / 微信真机快照</text>
        <text x="8" y="37" font-size="7.5" fill="#047857">• 纯函数字面量代理原型反射</text>

        <text x="0" y="52" font-size="8" font-weight="700" fill="#334155">物理分歧捕获:</text>
        <text x="8" y="65" font-size="7.5" fill="#B91C1C">• 差分实体检测 (782 条实测差异)</text>
        <text x="8" y="77" font-size="7.5" fill="#B91C1C">• 编译器合成桩分歧 (CASCADE '26)</text>
      </g>
    </g>

    <!-- Sub 3: 协同判定引擎 (Bottom Clean Banner) -->
    <g transform="translate(14, 162)">
      <rect x="0" y="0" width="438" height="46" rx="4" fill="#FFFFFF" stroke="#EA580C" stroke-width="1.2"/>
      <text x="219" y="16" text-anchor="middle" font-size="9.5" font-weight="800" fill="#9A3412">3) 八步协同判定引擎 D(req, target, C, E)</text>
      <text x="219" y="32" text-anchor="middle" font-size="8" fill="#475569">
        ★ 正向存在反例优先 ➔ 全端一致放行 (FOLD) | 任一冲突一票否决 (PROTECT) | 证据不足 (UNKNOWN)
      </text>
    </g>
  </g>

  <!-- Arrow Module 2 -> Module 3 -->
  <line x1="890" y1="161" x2="918" y2="161" stroke="#475569" stroke-width="1.6" marker-end="url(#arr)"/>

  <!-- ==================== MODULE 3: ③ 决策出口与保证 (Green Box) ==================== -->
  <g transform="translate(920, 52)">
    <rect x="0" y="0" width="170" height="218" rx="6" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.5"/>
    <text x="85" y="24" text-anchor="middle" font-size="12" font-weight="800" fill="#15803D">③ 决策出口与保证</text>

    <!-- 1) Three Verdicts -->
    <g transform="translate(10, 34)">
      <text x="2" y="12" font-size="8.5" font-weight="700" fill="#0F172A">1) 三态安全分流:</text>
      
      <rect x="2" y="17" width="146" height="18" rx="3" fill="#DCFCE7" stroke="#16A34A" stroke-width="0.8"/>
      <text x="75" y="30" text-anchor="middle" font-size="8" font-weight="800" fill="#15803D">FOLD 等价放行 (39.44%)</text>

      <rect x="2" y="38" width="146" height="18" rx="3" fill="#FEE2E2" stroke="#DC2626" stroke-width="0.8"/>
      <text x="75" y="51" text-anchor="middle" font-size="8" font-weight="800" fill="#B91C1C">PROTECT 冲突拦截 (37.76%)</text>

      <rect x="2" y="59" width="146" height="18" rx="3" fill="#FEF3C7" stroke="#D97706" stroke-width="0.8"/>
      <text x="75" y="72" text-anchor="middle" font-size="8" font-weight="800" fill="#B45309">UNKNOWN 保守未决 (22.80%)</text>
    </g>

    <!-- 2) Verification & Metric -->
    <g transform="translate(10, 126)">
      <text x="2" y="12" font-size="8.5" font-weight="700" fill="#0F172A">2) 双重闭环验证:</text>
      <text x="6" y="24" font-size="7.5" fill="#475569">• Level-1: 静态契约核验</text>
      <text x="6" y="36" font-size="7.5" fill="#475569">• Level-2: 动态轨迹比对 (P≈Q)</text>

      <rect x="2" y="44" width="146" height="34" rx="3" fill="#FFFFFF" stroke="#16A34A" stroke-width="1"/>
      <text x="75" y="58" text-anchor="middle" font-size="8.5" font-weight="900" fill="#15803D">✅ 可判定率 77.20%</text>
      <text x="75" y="70" text-anchor="middle" font-size="7.5" font-weight="800" fill="#047857">实测差异误放行: 0 条！</text>
    </g>
  </g>

  <!-- Right Output Label -->
  <g transform="translate(1096, 115)">
    <line x1="0" y1="20" x2="24" y2="20" stroke="#475569" stroke-width="1.4" marker-end="url(#arr)"/>
    <rect x="28" y="0" width="28" height="34" rx="3" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.2"/>
    <line x1="34" y1="8" x2="48" y2="8" stroke="#16A34A" stroke-width="1"/>
    <line x1="34" y1="14" x2="50" y2="14" stroke="#16A34A" stroke-width="1"/>
    <line x1="34" y1="20" x2="44" y2="20" stroke="#16A34A" stroke-width="1"/>
    <text x="42" y="50" text-anchor="middle" font-size="9.5" font-weight="700" fill="#15803D">保语义安全的</text>
    <text x="42" y="63" text-anchor="middle" font-size="9.5" font-weight="700" fill="#15803D">JavaScript 代码</text>
  </g>

  <!-- ========================================================================= -->
  <!-- BOTTOM SECTION: CODE TRANSFORMATION EXAMPLE (Y: 282, H: 185)              -->
  <!-- ========================================================================= -->

  <!-- Dashed Separation Line -->
  <line x1="16" y1="282" x2="1184" y2="282" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="4 3"/>
  <rect x="24" y="271" width="86" height="20" rx="3" fill="#64748B"/>
  <text x="67" y="285" text-anchor="middle" font-size="9" font-weight="700" fill="#FFFFFF">代码转换示例</text>

  <!-- Code Box 1: Raw Obfuscated (Pink Border) -->
  <g transform="translate(16, 298)">
    <rect x="0" y="0" width="180" height="152" rx="4" fill="#FFF1F2" stroke="#F43F5E" stroke-width="1"/>
    <text x="10" y="16" font-size="8.5" font-weight="800" fill="#9F1239">原始混淆代码 (Input)</text>
    <text x="10" y="34" font-family="monospace" font-size="7.5" fill="#334155">var _0x1 = ['request'];</text>
    <text x="10" y="48" font-family="monospace" font-size="7.5" fill="#334155">var a = 1 + 2 + 3;</text>
    <text x="10" y="66" font-family="monospace" font-size="7.5" fill="#BE123C">if (typeof wx !== 'undefined'){</text>
    <text x="18" y="80" font-family="monospace" font-size="7.5" fill="#BE123C">  wx[_0x1[0]]({ url: '/pay' });</text>
    <text x="10" y="94" font-family="monospace" font-size="7.5" fill="#BE123C">}</text>
    <text x="10" y="112" font-family="monospace" font-size="7.5" fill="#334155">var t = Date.now();</text>
    <text x="10" y="136" font-size="7" fill="#64748B">待去混淆求值 ➔</text>
  </g>

  <!-- Arrow ① -->
  <g transform="translate(202, 368)">
    <line x1="0" y1="0" x2="26" y2="0" stroke="#0284C7" stroke-width="1.4" marker-end="url(#arr-blue)"/>
    <text x="13" y="-5" text-anchor="middle" font-size="9" font-weight="800" fill="#0284C7">①</text>
  </g>

  <!-- Code Box 2: Decoupled Stage (Blue Border) -->
  <g transform="translate(234, 298)">
    <rect x="0" y="0" width="200" height="152" rx="4" fill="#F0F9FF" stroke="#0284C7" stroke-width="1"/>
    <text x="10" y="16" font-size="8.5" font-weight="800" fill="#0369A1">① 特征解耦提取</text>
    <text x="10" y="36" font-size="7.5" fill="#475569">// 代码依赖提取 (Required):</text>
    <text x="10" y="50" font-family="monospace" font-size="7.5" fill="#0369A1">req: wx.request (definite)</text>
    <text x="10" y="64" font-family="monospace" font-size="7.5" fill="#0369A1">stateful: Date.now()</text>
    <text x="10" y="86" font-size="7.5" fill="#475569">// 外部目标环境证实 (Target):</text>
    <text x="10" y="100" font-family="monospace" font-size="7.5" fill="#047857">target: WeChat (confirmed)</text>
    <text x="10" y="128" font-size="7.5" font-weight="700" fill="#0284C7">Required ⊥ Target 正交输入 ➔</text>
  </g>

  <!-- Arrow ② -->
  <g transform="translate(440, 368)">
    <line x1="0" y1="0" x2="26" y2="0" stroke="#EA580C" stroke-width="1.4" marker-end="url(#arr-orange)"/>
    <text x="13" y="-5" text-anchor="middle" font-size="9" font-weight="800" fill="#EA580C">②</text>
  </g>

  <!-- Code Box 3: Guard Core Decision (Orange Border) -->
  <g transform="translate(472, 298)">
    <rect x="0" y="0" width="280" height="152" rx="4" fill="#FFFDF5" stroke="#EA580C" stroke-width="1.2"/>
    <text x="10" y="16" font-size="8.5" font-weight="800" fill="#C2410C">② 守门模型两阶段裁决</text>
    <text x="10" y="34" font-size="7.5" fill="#475569">// Pass 1: 纯语言解密器放行求值</text>
    <text x="10" y="48" font-family="monospace" font-size="7.5" fill="#047857">_0x1[0] ➔ 解出明文 'request'</text>
    <text x="10" y="68" font-size="7.5" fill="#475569">// Pass 2: 宿主分支与状态机确证拦截</text>
    <text x="10" y="82" font-family="monospace" font-size="7.5" fill="#B91C1C">wx.request ➔ PROTECT (真机冲突)</text>
    <text x="10" y="96" font-family="monospace" font-size="7.5" fill="#B91C1C">Date.now() ➔ PROTECT (动态时钟)</text>
    <text x="10" y="112" font-family="monospace" font-size="7.5" fill="#047857">1 + 2 + 3  ➔ FOLD (安全折叠为 6)</text>
    <text x="10" y="134" font-size="7.5" font-weight="700" fill="#C2410C">输出三态保全指令 ➔</text>
  </g>

  <!-- Arrow ③ -->
  <g transform="translate(758, 368)">
    <line x1="0" y1="0" x2="26" y2="0" stroke="#16A34A" stroke-width="1.4" marker-end="url(#arr-green)"/>
    <text x="13" y="-5" text-anchor="middle" font-size="9" font-weight="800" fill="#16A34A">③</text>
  </g>

  <!-- Code Box 4: Contrast Failure vs R97 Success (Green Border) -->
  <g transform="translate(790, 298)">
    <rect x="0" y="0" width="384" height="152" rx="4" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.2"/>
    <text x="10" y="16" font-size="8.5" font-weight="800" fill="#15803D">③ 最终反混淆结果对比 (Output)</text>
    
    <!-- Left: Without R97 Crash -->
    <g transform="translate(8, 24)">
      <rect x="0" y="0" width="176" height="114" rx="3" fill="#FFF1F2" stroke="#FECDD3" stroke-width="0.8"/>
      <text x="8" y="15" font-size="7.5" font-weight="800" fill="#9F1239">传统工具 (无 R97):</text>
      <text x="8" y="32" font-family="monospace" font-size="7" fill="#64748B">var a = 6;</text>
      <text x="8" y="48" font-family="monospace" font-size="7" fill="#BE123C">// 💥 误判 typeof wx 为假</text>
      <text x="8" y="62" font-family="monospace" font-size="7" fill="#BE123C">// 整个微信支付分支被删除!</text>
      <text x="8" y="78" font-family="monospace" font-size="7" fill="#64748B">var t = 1760000000000;</text>
      <text x="8" y="100" font-size="7" font-weight="800" fill="#9F1239">💥 部署真机 TypeError 崩溃!</text>
    </g>

    <!-- Right: With R97 Success -->
    <g transform="translate(192, 24)">
      <rect x="0" y="0" width="184" height="114" rx="3" fill="#FFFFFF" stroke="#86EFAC" stroke-width="1"/>
      <text x="8" y="15" font-size="7.5" font-weight="800" fill="#15803D">集成 R97 守门保护:</text>
      <text x="8" y="32" font-family="monospace" font-size="7" fill="#047857">var a = 6; // 常量安全折叠</text>
      <text x="8" y="48" font-family="monospace" font-size="7" fill="#047857">if (typeof wx !== 'undefined'){</text>
      <text x="14" y="62" font-family="monospace" font-size="7" fill="#047857">  wx.request({ url: '/pay' });</text>
      <text x="8" y="76" font-family="monospace" font-size="7" fill="#047857">} // ✅ 核心支付分支 100% 保全</text>
      <text x="8" y="90" font-family="monospace" font-size="7" fill="#047857">var t = Date.now(); // 动态时钟</text>
      <text x="8" y="104" font-size="7" font-weight="800" fill="#15803D">✅ 真机部署 100% 正常运行！</text>
    </g>
  </g>
</svg>
'''

out_svg = "docs/r97_concise_architecture.svg"
out_html = "docs/r97_concise_architecture.html"
out_png = "docs/r97_concise_architecture.png"
out_pdf = "docs/r97_concise_architecture.pdf"

with open(out_svg, "w", encoding="utf-8") as f:
    f.write(svg_content)
print("Saved", out_svg)

html_wrap = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{{size:1200px 480px;margin:0;}}*{{margin:0;padding:0;box-sizing:border-box;}}body{{background:#fff;width:1200px;height:480px;overflow:hidden;}}svg{{display:block;}}</style></head><body>{svg_content}</body></html>'''
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
        "--window-size=1200,480",
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
