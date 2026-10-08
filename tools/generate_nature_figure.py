import os
import subprocess
import xml.etree.ElementTree as ET

svg_nature = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 760" width="1440" height="760" style="background:#FFFFFF; font-family:-apple-system, BlinkMacSystemFont, 'Arial', 'Helvetica Neue', 'Source Han Sans SC', 'Microsoft YaHei', sans-serif;">
  <defs>
    <!-- Markers -->
    <marker id="nat-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#374151"/>
    </marker>
    <marker id="nat-arr-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563EB"/>
    </marker>
    <marker id="nat-arr-purple" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#7C3AED"/>
    </marker>
    <marker id="nat-arr-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669"/>
    </marker>
    <marker id="nat-arr-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#DC2626"/>
    </marker>
    <marker id="nat-arr-amber" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#D97706"/>
    </marker>
  </defs>

  <!-- Canvas Border -->
  <rect x="12" y="12" width="1416" height="736" rx="2" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1.2"/>

  <!-- ==================== HEADER (Nature Style) ==================== -->
  <g transform="translate(24, 32)">
    <text x="0" y="0" font-size="15" font-weight="bold" fill="#111827">Figure 1 | 目标运行时感知的反混淆折叠保护模型 (R97 Framework Overview)</text>
    <text x="0" y="18" font-size="11" fill="#4B5563">
      解耦代码能力需求与外部部署证据的双轨架构，通过 4 宿主实测探针和 8 步递进判定链，在异构求值环境下实现零不安全折叠（Zero Unsafe Folds）。
    </text>
  </g>

  <!-- ==================== PANEL a: INPUTS & DUAL-TRACK EXTRACTION ==================== -->
  <g id="panel-a" transform="translate(24, 66)">
    <text x="0" y="16" font-size="15" font-weight="900" fill="#111827">a</text>
    <text x="18" y="16" font-size="12" font-weight="bold" fill="#1F2937">双轨正交解耦与特征提取 (Dual-Track Decoupled Extraction)</text>

    <!-- Main Container -->
    <rect x="0" y="24" width="410" height="580" rx="4" fill="#FAFAFA" stroke="#D1D5DB" stroke-width="1"/>

    <!-- Track A: Code Side -->
    <g transform="translate(12, 34)">
      <rect x="0" y="0" width="386" height="206" rx="3" fill="#F0F9FF" stroke="#38BDF8" stroke-width="1"/>
      <rect x="0" y="0" width="386" height="24" rx="3" fill="#E0F2FE" stroke="#38BDF8" stroke-width="1"/>
      <text x="10" y="16" font-size="10.5" font-weight="bold" fill="#0369A1">代码侧（内部证据）：必需运行时依赖提取</text>

      <!-- Subflow: Source -> AST -> Entity -->
      <g transform="translate(10, 32)">
        <rect x="0" y="0" width="85" height="48" rx="2" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
        <text x="42" y="18" text-anchor="middle" font-size="10" font-weight="bold" fill="#0F172A">混淆代码</text>
        <text x="42" y="31" text-anchor="middle" font-size="8.5" fill="#64748B">Source AST</text>
        <text x="42" y="41" text-anchor="middle" font-size="7.5" fill="#94A3B8">候选折叠点</text>

        <line x1="85" y1="24" x2="103" y2="24" stroke="#0284C7" stroke-width="1" marker-end="url(#nat-arr-blue)"/>

        <rect x="105" y="0" width="115" height="48" rx="2" fill="#FFFFFF" stroke="#BAE6FD" stroke-width="1"/>
        <text x="162" y="18" text-anchor="middle" font-size="10" font-weight="bold" fill="#0F172A">绑定与作用域</text>
        <text x="162" y="31" text-anchor="middle" font-size="8.5" fill="#64748B">词法遮蔽检测</text>
        <text x="162" y="41" text-anchor="middle" font-size="8" fill="#94A3B8">常量别名跟踪</text>

        <line x1="220" y1="24" x2="238" y2="24" stroke="#0284C7" stroke-width="1" marker-end="url(#nat-arr-blue)"/>

        <rect x="240" y="0" width="126" height="48" rx="2" fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2"/>
        <text x="303" y="18" text-anchor="middle" font-size="10" font-weight="bold" fill="#0369A1">运行时实体识别</text>
        <text x="303" y="31" text-anchor="middle" font-size="8.5" fill="#64748B">宿主归属表匹配</text>
        <text x="303" y="41" text-anchor="middle" font-size="8" fill="#0284C7">区分专属根/内建</text>
      </g>

      <!-- Status Chips for Required -->
      <g transform="translate(10, 88)">
        <rect x="0" y="0" width="366" height="106" rx="2" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <text x="10" y="16" font-size="9.5" font-weight="bold" fill="#334155">代码必需能力状态输出 (Required Status: req):</text>

        <rect x="10" y="24" width="346" height="23" rx="2" fill="#F0FDF4" stroke="#86EFAC" stroke-width="0.8"/>
        <text x="18" y="39" font-size="9" font-weight="bold" fill="#15803D">definite (确定依赖)</text>
        <text x="145" y="39" font-size="8.5" fill="#166534">静态绑定的宿主 API (如未遮蔽全局 wx.*)</text>

        <rect x="10" y="51" width="346" height="23" rx="2" fill="#FEF9C3" stroke="#FDE047" stroke-width="0.8"/>
        <text x="18" y="66" font-size="9" font-weight="bold" fill="#A16207">possible (可能依赖)</text>
        <text x="145" y="66" font-size="8.5" fill="#854D0E">动态属性访问 / 参数传递 (保守降级)</text>

        <rect x="10" y="78" width="346" height="23" rx="2" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="18" y="93" font-size="9" font-weight="bold" fill="#475569">not_required (不依赖)</text>
        <text x="145" y="93" font-size="8.5" fill="#64748B">纯 ECMAScript 语言内建 / 局部变量</text>
      </g>
    </g>

    <!-- Central Isolation Invariant Firewall -->
    <g transform="translate(12, 248)">
      <rect x="0" y="0" width="386" height="74" rx="3" fill="#FEF2F2" stroke="#EF4444" stroke-width="1.2" stroke-dasharray="3 3"/>
      <rect x="10" y="8" width="62" height="18" rx="2" fill="#DC2626"/>
      <text x="41" y="21" text-anchor="middle" font-size="9" font-weight="bold" fill="#FFFFFF">核心红线</text>
      <text x="78" y="21" font-size="10.5" font-weight="bold" fill="#991B1B">正交隔离公理：禁止循环论证</text>
      <text x="10" y="40" font-size="9" fill="#7F1D1D">
        • 代码特征仅产生 <tspan font-weight="bold">required</tspan> 需求，<tspan font-weight="bold">严禁</tspan>反向判定代码部署在什么环境。
      </text>
      <text x="10" y="54" font-size="8.5" fill="#991B1B">
        • 示例：代码出现 <tspan font-family="monospace">wx</tspan> 仅表明依赖微信，绝不能据此断言目标环境就是微信！
      </text>
      <text x="10" y="67" font-size="8" fill="#B91C1C">
        • 目标环境必须且仅能由下方的独立外部证据确立。
      </text>
    </g>

    <!-- Track B: Evidence Side -->
    <g transform="translate(12, 330)">
      <rect x="0" y="0" width="386" height="236" rx="3" fill="#FAF5FF" stroke="#A855F7" stroke-width="1"/>
      <rect x="0" y="0" width="386" height="24" rx="3" fill="#F3E8FF" stroke="#A855F7" stroke-width="1"/>
      <text x="10" y="16" font-size="10.5" font-weight="bold" fill="#6D28D9">证据侧（外部证据）：目标运行时解析</text>

      <!-- Subflow: Manifest -> Resolver -->
      <g transform="translate(10, 32)">
        <rect x="0" y="0" width="160" height="48" rx="2" fill="#FFFFFF" stroke="#E9D5FF" stroke-width="1"/>
        <text x="80" y="17" text-anchor="middle" font-size="10" font-weight="bold" fill="#1F2937">外部清单与指纹</text>
        <text x="80" y="30" text-anchor="middle" font-size="8.5" fill="#6B7280">project.config.json · app.json</text>
        <text x="80" y="41" text-anchor="middle" font-size="8" fill="#94A3B8">SDK基线 · 构建输出特征</text>

        <line x1="160" y1="24" x2="188" y2="24" stroke="#7C3AED" stroke-width="1" marker-end="url(#nat-arr-purple)"/>

        <rect x="190" y="0" width="176" height="48" rx="2" fill="#FFFFFF" stroke="#7C3AED" stroke-width="1.2"/>
        <text x="278" y="17" text-anchor="middle" font-size="10" font-weight="bold" fill="#6D28D9">目标运行时解析器</text>
        <text x="278" y="30" text-anchor="middle" font-size="8.5" fill="#6B7280">证据可信度裁决</text>
        <text x="278" y="41" text-anchor="middle" font-size="8" fill="#7C3AED">互斥冲突检验 · 防伪</text>
      </g>

      <!-- Target Status Matrix -->
      <g transform="translate(10, 88)">
        <rect x="0" y="0" width="366" height="136" rx="2" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <text x="10" y="16" font-size="9.5" font-weight="bold" fill="#334155">目标环境确认状态分级 (Target Status: target):</text>

        <!-- 6 sub-boxes -->
        <g transform="translate(10, 24)">
          <rect x="0" y="0" width="110" height="46" rx="2" fill="#F0FDF4" stroke="#86EFAC" stroke-width="0.8"/>
          <text x="55" y="18" text-anchor="middle" font-size="8.5" font-weight="bold" fill="#15803D">confirmed 已确认</text>
          <text x="55" y="34" text-anchor="middle" font-size="7.5" fill="#166534">唯一外部强证据证实</text>

          <rect x="118" y="0" width="110" height="46" rx="2" fill="#EEF2FF" stroke="#A5B4FC" stroke-width="0.8"/>
          <text x="173" y="18" text-anchor="middle" font-size="8.5" font-weight="bold" fill="#374151">corroborated 已佐证</text>
          <text x="173" y="34" text-anchor="middle" font-size="7.5" fill="#4338CA">多弱证据交叉支撑</text>

          <rect x="236" y="0" width="110" height="46" rx="2" fill="#FEF3C7" stroke="#FDE68A" stroke-width="0.8"/>
          <text x="291" y="18" text-anchor="middle" font-size="8.5" font-weight="bold" fill="#B45309">declared 仅声明</text>
          <text x="291" y="34" text-anchor="middle" font-size="7.5" fill="#92400E">未核验弱声明 (禁折叠)</text>

          <rect x="0" y="54" width="110" height="46" rx="2" fill="#FFEDD5" stroke="#FDBA74" stroke-width="0.8"/>
          <text x="55" y="72" text-anchor="middle" font-size="8.5" font-weight="bold" fill="#C2410C">inferred 推断</text>
          <text x="55" y="88" text-anchor="middle" font-size="7.5" fill="#9A3412">探测特征 (严禁折叠)</text>

          <rect x="118" y="54" width="110" height="46" rx="2" fill="#FEE2E2" stroke="#FCA5A5" stroke-width="0.8"/>
          <text x="173" y="72" text-anchor="middle" font-size="8.5" font-weight="bold" fill="#B91C1C">conflict 冲突</text>
          <text x="173" y="88" text-anchor="middle" font-size="7.5" fill="#991B1B">外部多配置互斥</text>

          <rect x="236" y="54" width="110" height="46" rx="2" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="0.8"/>
          <text x="291" y="72" text-anchor="middle" font-size="8.5" font-weight="bold" fill="#475569">unknown 未知</text>
          <text x="291" y="88" text-anchor="middle" font-size="7.5" fill="#64748B">证据缺失 (保守回退)</text>
        </g>
      </g>
    </g>
  </g>

  <!-- ==================== PANEL b: SEMANTIC CONTRACT & PROBING ==================== -->
  <g id="panel-b" transform="translate(446, 66)">
    <text x="0" y="16" font-size="15" font-weight="900" fill="#111827">b</text>
    <text x="18" y="16" font-size="12" font-weight="bold" fill="#1F2937">契约构建与实测探针 (Contract &amp; Probing Harness)</text>

    <!-- Container -->
    <rect x="0" y="24" width="375" height="580" rx="4" fill="#FAFAFA" stroke="#D1D5DB" stroke-width="1"/>

    <!-- Sub-panel b1: Contract Builder -->
    <g transform="translate(12, 34)">
      <rect x="0" y="0" width="351" height="156" rx="3" fill="#FFFFFF" stroke="#0284C7" stroke-width="1"/>
      <rect x="0" y="0" width="351" height="24" rx="3" fill="#E0F2FE" stroke="#0284C7" stroke-width="1"/>
      <text x="10" y="16" font-size="10.5" font-weight="bold" fill="#0369A1">语义契约模型构建 C (Semantic Contract Builder)</text>

      <g transform="translate(10, 32)">
        <text x="0" y="12" font-size="9" fill="#334155">• 从语法用法上下文中投影所需观测维度：</text>
        <g transform="translate(0, 20)">
          <rect x="0" y="0" width="102" height="22" rx="2" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="0.8"/>
          <text x="51" y="14" text-anchor="middle" font-size="8" font-family="monospace" fill="#0369A1">typeof 维度</text>

          <rect x="112" y="0" width="102" height="22" rx="2" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="0.8"/>
          <text x="163" y="14" text-anchor="middle" font-size="8" font-family="monospace" fill="#0369A1">truthiness 维度</text>

          <rect x="224" y="0" width="107" height="22" rx="2" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="0.8"/>
          <text x="277" y="14" text-anchor="middle" font-size="8" font-family="monospace" fill="#0369A1">return_val 维度</text>
        </g>

        <!-- Deterministic Trap Guard -->
        <rect x="0" y="52" width="331" height="58" rx="2" fill="#FEF2F2" stroke="#FECACA" stroke-width="1"/>
        <text x="8" y="68" font-size="9" font-weight="bold" fill="#991B1B">规范级非确定性语言内建陷阱拦截：</text>
        <text x="8" y="82" font-size="8.5" fill="#7F1D1D">
          调用结果随时间或随机源变化（如 <tspan font-family="monospace">Date.now()</tspan>, <tspan font-family="monospace">Math.random()</tspan>）
        </text>
        <text x="8" y="96" font-size="8" fill="#B91C1C">
          ➔ 契约强制要求 return_value 维度，探针无法证明等价，安全收敛至 UNKNOWN。
        </text>
      </g>
    </g>

    <!-- Sub-panel b2: 4-Host Probing Harness -->
    <g transform="translate(12, 198)">
      <rect x="0" y="0" width="351" height="394" rx="3" fill="#FFFFFF" stroke="#334155" stroke-width="1"/>
      <rect x="0" y="0" width="351" height="24" rx="3" fill="#F1F5F9" stroke="#334155" stroke-width="1"/>
      <text x="10" y="16" font-size="10.5" font-weight="bold" fill="#0F172A">4 宿主自动化差分探针集群 (Empirical Probing Harness)</text>

      <!-- 4 Host Tags (Explicit clean groups) -->
      <g transform="translate(10, 32)">
        <!-- Probe 1 -->
        <g transform="translate(0, 0)">
          <rect x="0" y="0" width="160" height="42" rx="2" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="0.8"/>
          <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">① 纯 ECMAScript VM</text>
          <text x="8" y="30" font-size="8" fill="#64748B">Isolated Node vm (求值基线)</text>
        </g>

        <!-- Probe 2 -->
        <g transform="translate(171, 0)">
          <rect x="0" y="0" width="160" height="42" rx="2" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="0.8"/>
          <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">② 本地原生 Node.js</text>
          <text x="8" y="30" font-size="8" fill="#64748B">Node.js v20+ 生产环境</text>
        </g>

        <!-- Probe 3 -->
        <g transform="translate(0, 48)">
          <rect x="0" y="0" width="160" height="42" rx="2" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="0.8"/>
          <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">③ Headless 浏览器</text>
          <text x="8" y="30" font-size="8" fill="#64748B">Microsoft Edge (DOM/BOM)</text>
        </g>

        <!-- Probe 4 -->
        <g transform="translate(171, 48)">
          <rect x="0" y="0" width="160" height="42" rx="2" fill="#F0F9FF" stroke="#38BDF8" stroke-width="1"/>
          <text x="8" y="16" font-size="9" font-weight="bold" fill="#0369A1">④ 微信开发者工具</text>
          <text x="8" y="30" font-size="8" fill="#0284C7">SDK 3.17.3 (AppService+Worker)</text>
        </g>
      </g>

      <!-- Observation DB Cylinder -->
      <g transform="translate(10, 136)">
        <path d="M 0 12 A 165 12 0 0 0 331 12 A 165 12 0 0 0 0 12 Z" fill="#E2E8F0" stroke="#475569" stroke-width="1"/>
        <path d="M 0 12 L 0 180 A 165 12 0 0 0 331 180 L 331 12 Z" fill="#F8FAFC" stroke="#475569" stroke-width="1"/>
        <path d="M 0 180 A 165 12 0 0 0 331 180" fill="none" stroke="#475569" stroke-width="1"/>
        <path d="M 0 68 A 165 12 0 0 0 331 68" fill="none" stroke="#CBD5E1" stroke-dasharray="2 2"/>
        <path d="M 0 124 A 165 12 0 0 0 331 124" fill="none" stroke="#CBD5E1" stroke-dasharray="2 2"/>

        <text x="165" y="34" text-anchor="middle" font-size="11" font-weight="bold" fill="#0F172A">差分实测证据库 E (Observation Database)</text>
        <text x="165" y="48" text-anchor="middle" font-size="8.5" fill="#64748B">跨环境实测投影证据集合</text>

        <text x="12" y="78" font-size="9" font-weight="bold" fill="#1E293B">• 实测基准覆盖：1,248 个实体快照 / 785 条跨环境实测差分</text>
        <text x="12" y="93" font-size="8.5" fill="#475569">• 观测四元组：⟨entityId, dimension, value, foldEligible⟩</text>
        <text x="12" y="108" font-size="8.5" fill="#475569">• 快照防伪指纹：SHA-256(SDK版本 | 探针代码 | 宿主指纹)</text>

        <rect x="12" y="132" width="307" height="34" rx="2" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="18" y="147" font-size="8.5" font-weight="bold" fill="#334155">自动失效条件 (Cache Invalidation):</text>
        <text x="18" y="159" font-size="8" fill="#64748B">SDK版本变更 · 环境指纹改变 · 契约版本升级 ➔ 强制证据过期</text>
      </g>

      <!-- Bottom verification badge -->
      <g transform="translate(10, 336)">
        <rect x="0" y="0" width="331" height="46" rx="2" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1"/>
        <text x="10" y="18" font-size="9" font-weight="bold" fill="#166534">双层真机动态执行验证 (Level-2 Dynamic Verification):</text>
        <text x="10" y="32" font-size="8.5" fill="#15803D">
          语料实际放行 1,338 程序点，动态验证 386 点，实测行为不一致率：<tspan font-weight="bold">0.00%</tspan>
        </text>
      </g>
    </g>
  </g>

  <!-- Connectors into Stage c -->
  <line x1="410" y1="180" x2="446" y2="180" stroke="#0284C7" stroke-width="1.2" marker-end="url(#nat-arr-blue)"/>
  <line x1="410" y1="460" x2="446" y2="460" stroke="#7C3AED" stroke-width="1.2" marker-end="url(#nat-arr-purple)"/>

  <!-- ==================== PANEL c: 8-STAGE DECISION CORE ==================== -->
  <g id="panel-c" transform="translate(833, 66)">
    <text x="0" y="16" font-size="15" font-weight="900" fill="#111827">c</text>
    <text x="18" y="16" font-size="12" font-weight="bold" fill="#1F2937">八步安全判定核心 D (Fail-Safe Decision Core)</text>

    <!-- Container -->
    <rect x="0" y="24" width="295" height="580" rx="4" fill="#FAFAFA" stroke="#D1D5DB" stroke-width="1"/>

    <!-- Math Formula Bar -->
    <g transform="translate(10, 32)">
      <rect x="0" y="0" width="275" height="30" rx="3" fill="#0F172A" stroke="#1E293B" stroke-width="1"/>
      <text x="137" y="20" text-anchor="middle" font-size="10.5" font-family="monospace" font-weight="bold" fill="#38BDF8">
        D(req, target, C, E) → { F, P, U }
      </text>
    </g>

    <!-- 8 Sequential Steps (Cleanly spaced without gaps) -->
    <g transform="translate(10, 68)">
      <!-- Step 1 -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="275" height="42" rx="2" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">① 静态绑定合法性检验</text>
        <text x="8" y="30" font-size="8" fill="#64748B">若为 dynamic 动态属性 / 作用域未解析 ➔ UNKNOWN</text>
      </g>

      <!-- Step 2 -->
      <g transform="translate(0, 47)">
        <rect x="0" y="0" width="275" height="42" rx="2" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">② 契约确定性陷阱检查</text>
        <text x="8" y="30" font-size="8" fill="#64748B">若含 Date.now() / Math.random() ➔ UNKNOWN</text>
      </g>

      <!-- Step 3 -->
      <g transform="translate(0, 94)">
        <rect x="0" y="0" width="275" height="42" rx="2" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">③ 必需依赖明确性检验</text>
        <text x="8" y="30" font-size="8" fill="#64748B">代码存在依赖但 req 状态非 definite ➔ UNKNOWN</text>
      </g>

      <!-- Step 4 -->
      <g transform="translate(0, 141)">
        <rect x="0" y="0" width="275" height="42" rx="2" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">④ 目标确认状态核准 (confirmed?)</text>
        <text x="8" y="30" font-size="8" fill="#64748B">target 状态未获强证实 (declared/inferred) ➔ UNKNOWN</text>
      </g>

      <!-- Step 5 -->
      <g transform="translate(0, 188)">
        <rect x="0" y="0" width="275" height="42" rx="2" fill="#FEF2F2" stroke="#FECACA" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#991B1B">⑤ 必需宿主缺失硬保护检验</text>
        <text x="8" y="30" font-size="8" fill="#B91C1C">已确认目标完全缺失该必需能力 ➔ 硬 PROTECT</text>
      </g>

      <!-- Step 6 -->
      <g transform="translate(0, 235)">
        <rect x="0" y="0" width="275" height="42" rx="2" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">⑥ 探针证据时效与指纹匹配</text>
        <text x="8" y="30" font-size="8" fill="#64748B">无对应环境探针观测 / 指纹过期 ➔ UNKNOWN</text>
      </g>

      <!-- Step 7 -->
      <g transform="translate(0, 282)">
        <rect x="0" y="0" width="275" height="50" rx="2" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#166534">⑦ 契约维度观测投影比对 (strict_equal)</text>
        <text x="8" y="30" font-size="8" fill="#15803D">求值环境与目标环境在 C 维度下实测严格相等</text>
        <text x="8" y="42" font-size="7.5" fill="#B91C1C">维度存在实测不一致 ➔ PROTECT | 维度缺失 ➔ UNKNOWN</text>
      </g>

      <!-- Step 8 -->
      <g transform="translate(0, 337)">
        <rect x="0" y="0" width="275" height="42" rx="2" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1"/>
        <text x="8" y="16" font-size="9" font-weight="bold" fill="#0F172A">⑧ 多目标一致性归约 (Aggregation)</text>
        <text x="8" y="30" font-size="8" fill="#475569">全目标匹配且 foldEligible ➔ FOLD | 任一冲突 ➔ PROTECT</text>
      </g>

      <!-- Proof Guarantee Card -->
      <g transform="translate(0, 386)">
        <rect x="0" y="0" width="275" height="80" rx="2" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1"/>
        <text x="8" y="18" font-size="9" font-weight="bold" fill="#92400E">判定保全定理 (Soundness Principle):</text>
        <text x="8" y="34" font-size="8.5" fill="#78350F">仅在多环境严格等价且证据完全可折叠时放行 FOLD；</text>
        <text x="8" y="48" font-size="8.5" fill="#78350F">任何外部未决、假定未明、或证据残缺，一律严格保守</text>
        <text x="8" y="62" font-size="8.5" fill="#78350F">收敛至 UNKNOWN（杜绝任何跨环境外推灾难）。</text>
      </g>
    </g>
  </g>

  <!-- Connectors into Stage c -->
  <line x1="821" y1="130" x2="833" y2="130" stroke="#0284C7" stroke-width="1.2" marker-end="url(#nat-arr-blue)"/>
  <line x1="821" y1="360" x2="833" y2="360" stroke="#334155" stroke-width="1.2" marker-end="url(#nat-arr)"/>

  <!-- ==================== PANEL d: VERDICTS & DEOBFUSCATION ==================== -->
  <g id="panel-d" transform="translate(1140, 66)">
    <text x="0" y="16" font-size="15" font-weight="900" fill="#111827">d</text>
    <text x="18" y="16" font-size="12" font-weight="bold" fill="#1F2937">三值出口与下游守护 (Verdicts &amp; Guard)</text>

    <!-- Container -->
    <rect x="0" y="24" width="276" height="580" rx="4" fill="#FAFAFA" stroke="#D1D5DB" stroke-width="1"/>

    <!-- Verdict Cards (Clean separate groups) -->
    <g transform="translate(10, 32)">
      <!-- FOLD Card -->
      <g id="card-fold" transform="translate(0, 0)">
        <rect x="0" y="0" width="256" height="68" rx="3" fill="#ECFDF5" stroke="#10B981" stroke-width="1.2"/>
        <rect x="8" y="8" width="52" height="18" rx="2" fill="#10B981"/>
        <text x="34" y="21" text-anchor="middle" font-size="10" font-weight="bold" fill="#FFFFFF">FOLD</text>
        <text x="68" y="21" font-size="10.5" font-weight="bold" fill="#065F46">等价安全放行</text>
        <text x="8" y="38" font-size="8.5" fill="#047857">• 证实目标环境与求值基线严格一致</text>
        <text x="8" y="50" font-size="8.5" fill="#047857">• 授权下游执行常量折叠与死分支消除</text>
        <text x="8" y="62" font-size="8" font-weight="bold" fill="#059669">实测 785 差分点误放行：0 (Zero Unsafe Folds)</text>
      </g>

      <!-- PROTECT Card -->
      <g id="card-protect" transform="translate(0, 76)">
        <rect x="0" y="0" width="256" height="68" rx="3" fill="#FEF2F2" stroke="#EF4444" stroke-width="1.2"/>
        <rect x="8" y="8" width="68" height="18" rx="2" fill="#EF4444"/>
        <text x="42" y="21" text-anchor="middle" font-size="10" font-weight="bold" fill="#FFFFFF">PROTECT</text>
        <text x="84" y="21" font-size="10.5" font-weight="bold" fill="#991B1B">冲突硬拦截</text>
        <text x="8" y="38" font-size="8.5" fill="#B91C1C">• 实测证实环境存在异构冲突 (如 wx 差分)</text>
        <text x="8" y="50" font-size="8.5" fill="#B91C1C">• 强制阻止折叠，保留完整分支与宿主调用</text>
        <text x="8" y="62" font-size="8" font-weight="bold" fill="#DC2626">环境敏感分支拦截率：100.0%</text>
      </g>

      <!-- UNKNOWN Card -->
      <g id="card-unknown" transform="translate(0, 152)">
        <rect x="0" y="0" width="256" height="114" rx="3" fill="#FFFBEB" stroke="#F59E0B" stroke-width="1.2"/>
        <rect x="8" y="8" width="75" height="18" rx="2" fill="#F59E0B"/>
        <text x="45" y="21" text-anchor="middle" font-size="10" font-weight="bold" fill="#FFFFFF">UNKNOWN</text>
        <text x="90" y="21" font-size="10.5" font-weight="bold" fill="#92400E">保守安全未决</text>
        <text x="8" y="38" font-size="8.5" fill="#78350F">证据不完备时保守兜底，输出细粒度归因：</text>

        <!-- 3 Attributions -->
        <g transform="translate(8, 46)">
          <rect x="0" y="0" width="240" height="18" rx="1" fill="#FEF3C7" stroke="#FDE68A" stroke-width="0.8"/>
          <text x="6" y="13" font-size="7.5" font-family="monospace" font-weight="bold" fill="#92400E">binding</text>
          <text x="56" y="13" font-size="7.5" fill="#78350F">: 语法绑定未决 / 动态属性访问</text>

          <rect x="0" y="22" width="240" height="18" rx="1" fill="#FEF3C7" stroke="#FDE68A" stroke-width="0.8"/>
          <text x="6" y="35" font-size="7.5" font-family="monospace" font-weight="bold" fill="#92400E">runtime</text>
          <text x="56" y="35" font-size="7.5" fill="#78350F">: 目标未证实 / 缺对应宿主探针数据</text>

          <rect x="0" y="44" width="240" height="18" rx="1" fill="#FEF3C7" stroke="#FDE68A" stroke-width="0.8"/>
          <text x="6" y="57" font-size="7.5" font-family="monospace" font-weight="bold" fill="#92400E">behavior</text>
          <text x="56" y="57" font-size="7.5" fill="#78350F">: 契约维度缺失 / 实测不可折叠</text>
        </g>
      </g>
    </g>

    <!-- Downstream Deobfuscation Box -->
    <g transform="translate(10, 344)">
      <rect x="0" y="0" width="256" height="216" rx="3" fill="#FFFFFF" stroke="#374151" stroke-width="1.2"/>
      <rect x="0" y="0" width="256" height="24" rx="3" fill="#F3F4F6" stroke="#374151" stroke-width="1.2"/>
      <text x="128" y="16" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#111827">下游反混淆守门集成 (Integration)</text>

      <!-- Action A -->
      <g transform="translate(10, 36)">
        <rect x="0" y="0" width="236" height="48" rx="2" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1"/>
        <text x="8" y="18" font-size="9" font-weight="bold" fill="#166534">当接收 [FOLD] 判定：</text>
        <text x="8" y="32" font-size="8.5" fill="#15803D">放行！执行 AST 常量折叠与死分支剔除；</text>
        <text x="8" y="42" font-size="8" fill="#166534">代码体积精简，且真实运行行为零偏差。</text>
      </g>

      <!-- Action B -->
      <g transform="translate(10, 92)">
        <rect x="0" y="0" width="236" height="76" rx="2" fill="#FEF2F2" stroke="#FECACA" stroke-width="1"/>
        <text x="8" y="18" font-size="9" font-weight="bold" fill="#991B1B">当接收 [PROTECT] 或 [UNKNOWN]：</text>
        <text x="8" y="32" font-size="8.5" fill="#B91C1C">守门器强制拦截！保留原 AST 语法节点；</text>
        <text x="8" y="46" font-size="8.5" fill="#B91C1C">杜绝将 <tspan font-family="monospace">typeof wx!=='undefined'</tspan> 等误折为假；</text>
        <text x="8" y="60" font-size="8" font-weight="bold" fill="#DC2626">杜绝微信/浏览器部署后发生核心功能缺失崩溃。</text>
      </g>

      <!-- Supported tools tag -->
      <g transform="translate(10, 178)">
        <rect x="0" y="0" width="236" height="28" rx="2" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="0.8"/>
        <text x="118" y="18" text-anchor="middle" font-size="8" fill="#64748B">支持无缝集成：webcrack / Terser / Babel 优化管线</text>
      </g>
    </g>

    <!-- Clean downward connection into downstream without crossing text -->
    <path d="M 138 298 L 138 344" fill="none" stroke="#64748B" stroke-width="1.2" stroke-dasharray="3 3" marker-end="url(#nat-arr)"/>
  </g>

  <!-- Connectors from Stage c to Stage d -->
  <line x1="1128" y1="140" x2="1140" y2="140" stroke="#10B981" stroke-width="1.4" marker-end="url(#nat-arr-green)"/>
  <line x1="1128" y1="216" x2="1140" y2="216" stroke="#DC2626" stroke-width="1.4" marker-end="url(#nat-arr-red)"/>
  <line x1="1128" y1="292" x2="1140" y2="292" stroke="#D97706" stroke-width="1.4" marker-end="url(#nat-arr-amber)"/>

  <!-- ==================== FOOTER: NATURE LEGEND ==================== -->
  <rect x="24" y="688" width="1392" height="44" rx="2" fill="#F9FAFB" stroke="#E5E7EB" stroke-width="1"/>
  <text x="36" y="706" font-size="9.5" font-weight="bold" fill="#111827">核心架构特征归纳：</text>
  <text x="36" y="722" font-size="9" fill="#4B5563">
    <tspan font-weight="bold">a</tspan>, 代码能力需求分析与外部目标解析严格正交解耦，中间隔离壁垒杜绝循环论证；
    <tspan font-weight="bold">b</tspan>, 语义契约提取关键变换维度并拦截非确定性内建，4 宿主探针提供实测差分支撑；
    <tspan font-weight="bold">c</tspan>, 8 步递进判定链仅在全目标严格等价且可折叠时放行；
    <tspan font-weight="bold">d</tspan>, 守门器保护敏感分支，实测实现零误放行（0 Unsafe Folds）。
  </text>
</svg>
'''

with open("docs/r97_nature_model_architecture.svg", "w", encoding="utf-8") as f:
    f.write(svg_nature)

print("Saved clean SVG to docs/r97_nature_model_architecture.svg")

# Verify collisions
tree = ET.parse("docs/r97_nature_model_architecture.svg")
root = tree.getroot()
texts = []
def walk(elem, cur_x=0, cur_y=0):
    tx, ty = 0, 0
    tr = elem.attrib.get('transform', '')
    if 'translate(' in tr:
        parts = tr.split('translate(')[1].split(')')[0].split(',')
        tx = float(parts[0])
        ty = float(parts[1]) if len(parts) > 1 else 0
    nx, ny = cur_x + tx, cur_y + ty
    tag = elem.tag.split('}')[-1]
    if tag == 'text':
        x = float(elem.attrib.get('x', 0)) + nx
        y = float(elem.attrib.get('y', 0)) + ny
        texts.append((x, y, ''.join(elem.itertext()).strip()))
    for child in elem:
        walk(child, nx, ny)

walk(root)
print(f"Total text elements: {len(texts)}")
collisions = 0
for i in range(len(texts)):
    for j in range(i+1, len(texts)):
        x1, y1, t1 = texts[i]
        x2, y2, t2 = texts[j]
        if abs(x1 - x2) < 15 and abs(y1 - y2) < 8:
            print(f"  COLLISION: ({x1},{y1}) '{t1}' vs ({x2},{y2}) '{t2}'")
            collisions += 1

print(f"Verification complete: {collisions} collisions detected.")
