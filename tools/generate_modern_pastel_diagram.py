import os
import subprocess

svg_pastel = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 760" width="1440" height="760" style="background:#FFFFFF; font-family:-apple-system, BlinkMacSystemFont, 'Nunito', 'Poppins', 'Segoe UI', Arial, sans-serif;">
  <defs>
    <!-- Soft Ambient Shadow for Floating Panels -->
    <filter id="card-shadow" x="-5%" y="-3%" width="110%" height="108%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.06" />
    </filter>

    <!-- Markers -->
    <marker id="pst-arr-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7"/>
    </marker>
    <marker id="pst-arr-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669"/>
    </marker>
    <marker id="pst-arr-purple" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#7C3AED"/>
    </marker>
    <marker id="pst-arr-coral" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#E11D48"/>
    </marker>
  </defs>

  <!-- Top Title Bar (Modern Clean Typography) -->
  <g transform="translate(32, 34)">
    <rect x="0" y="-4" width="76" height="24" rx="12" fill="#E0F2FE" />
    <text x="38" y="12" text-anchor="middle" font-size="11" font-weight="700" fill="#0369A1">OVERVIEW</text>
    
    <text x="88" y="14" font-size="16" font-weight="800" fill="#0F172A">R97: 目标运行时感知的反混淆折叠保护架构 (Target-Runtime-Aware Guard)</text>
    <text x="0" y="32" font-size="11" fill="#64748B">
      现代 ML/系统顶会柔彩风格 · 代码能力需求与外部部署证据物理正交隔离 · 4 宿主实测探针驱动的零不安全折叠（Zero Unsafe Folds）
    </text>
  </g>

  <!-- ==================== PANEL 1: DUAL-TRACK EXTRACTION ==================== -->
  <g id="p1" transform="translate(32, 80)">
    <!-- Floating White Card -->
    <rect x="0" y="0" width="415" height="580" rx="14" fill="#FFFFFF" filter="url(#card-shadow)" stroke="#F1F5F9" stroke-width="1.5"/>

    <!-- Header Pill -->
    <rect x="18" y="16" width="28" height="22" rx="11" fill="#0284C7"/>
    <text x="32" y="31" text-anchor="middle" font-size="12" font-weight="800" fill="#FFFFFF">1</text>
    <text x="54" y="32" font-size="13" font-weight="800" fill="#0F172A">双轨正交解耦与特征提取</text>

    <!-- Top Track: Code-side Analysis -->
    <g transform="translate(18, 54)">
      <rect x="0" y="0" width="130" height="20" rx="10" fill="#E0F2FE"/>
      <text x="65" y="14" text-anchor="middle" font-size="10" font-weight="700" fill="#0369A1">代码侧（内部证据）</text>

      <!-- Code Snippet Micro-card -->
      <g transform="translate(0, 28)">
        <rect x="0" y="0" width="180" height="74" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <text x="12" y="20" font-family="monospace" font-size="9" fill="#0F172A"><tspan fill="#7C3AED">if</tspan> (<tspan fill="#0284C7">typeof</tspan> wx !== <tspan fill="#059669">'undefined'</tspan>)</text>
        <text x="12" y="36" font-family="monospace" font-size="9" fill="#0F172A">  <tspan fill="#D97706">wx</tspan>.request({ url: ... })</text>
        <line x1="12" y1="46" x2="168" y2="46" stroke="#E2E8F0" stroke-width="1"/>
        <text x="12" y="60" font-size="8.5" fill="#64748B">AST 词法解析 · 遮蔽与别名追踪</text>
      </g>

      <!-- Arrow -->
      <line x1="188" y1="65" x2="208" y2="65" stroke="#0284C7" stroke-width="1.5" marker-end="url(#pst-arr-blue)"/>

      <!-- Required Status Output -->
      <g transform="translate(212, 28)">
        <rect x="0" y="0" width="166" height="74" rx="8" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1"/>
        <text x="12" y="18" font-size="10" font-weight="700" fill="#166534">必需能力需求 (req)</text>
        <g transform="translate(10, 26)">
          <rect x="0" y="0" width="146" height="18" rx="9" fill="#DCFCE7"/>
          <text x="73" y="12" text-anchor="middle" font-size="8.5" font-weight="700" fill="#15803D">definite (wx.request)</text>

          <rect x="0" y="22" width="146" height="18" rx="9" fill="#FEF9C3"/>
          <text x="73" y="34" text-anchor="middle" font-size="8" fill="#A16207">possible (动态键访问)</text>
        </g>
      </g>
    </g>

    <!-- Central Floating Firewall Barrier -->
    <g transform="translate(18, 185)">
      <rect x="0" y="0" width="379" height="78" rx="10" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2" stroke-dasharray="4 3"/>
      <g transform="translate(14, 12)">
        <rect x="0" y="0" width="68" height="20" rx="10" fill="#E11D48"/>
        <text x="34" y="14" text-anchor="middle" font-size="9" font-weight="800" fill="#FFFFFF">隔离防火墙</text>
        <text x="78" y="14" font-size="11" font-weight="800" fill="#9F1239">正交隔离公理：Required ⊥ Target</text>
        
        <text x="0" y="35" font-size="9" fill="#BE123C">
          • <tspan font-weight="bold">禁止循环论证</tspan>：代码内部依赖 wx，绝不能作为证明代码运行在微信的证据！
        </text>
        <text x="0" y="50" font-size="8.5" fill="#E11D48">
          • 目标环境必须由下方完全独立的外部客观部署指纹单独证实。
        </text>
      </g>
    </g>

    <!-- Bottom Track: Evidence-side Target Resolution -->
    <g transform="translate(18, 285)">
      <rect x="0" y="0" width="130" height="20" rx="10" fill="#F3E8FF"/>
      <text x="65" y="14" text-anchor="middle" font-size="10" font-weight="700" fill="#7C3AED">证据侧（外部证据）</text>

      <!-- Manifest Micro-card -->
      <g transform="translate(0, 28)">
        <rect x="0" y="0" width="180" height="96" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <text x="12" y="18" font-size="9.5" font-weight="700" fill="#0F172A">project.config.json</text>
        <text x="12" y="32" font-size="8.5" fill="#64748B">{"miniprogramRoot": "dist/"}</text>
        <text x="12" y="46" font-size="8.5" fill="#64748B">SDK版本: 3.17.3 基线指纹</text>
        <line x1="12" y1="56" x2="168" y2="56" stroke="#E2E8F0" stroke-width="1"/>
        <text x="12" y="72" font-size="8.5" font-weight="600" fill="#7C3AED">目标运行时解析器</text>
        <text x="12" y="85" font-size="8" fill="#94A3B8">外部多源事实交叉核验</text>
      </g>

      <!-- Arrow -->
      <line x1="188" y1="76" x2="208" y2="76" stroke="#7C3AED" stroke-width="1.5" marker-end="url(#pst-arr-purple)"/>

      <!-- Target Status Pills -->
      <g transform="translate(212, 28)">
        <rect x="0" y="0" width="166" height="96" rx="8" fill="#FAF5FF" stroke="#E9D5FF" stroke-width="1"/>
        <text x="12" y="18" font-size="10" font-weight="700" fill="#6D28D9">目标环境状态 (target)</text>
        <g transform="translate(10, 26)">
          <rect x="0" y="0" width="146" height="18" rx="9" fill="#DCFCE7"/>
          <text x="73" y="12" text-anchor="middle" font-size="8.5" font-weight="700" fill="#15803D">confirmed (已证实微信)</text>

          <rect x="0" y="22" width="146" height="18" rx="9" fill="#EDE9FE"/>
          <text x="73" y="34" text-anchor="middle" font-size="8" fill="#6D28D9">corroborated (弱证据佐证)</text>

          <rect x="0" y="44" width="146" height="18" rx="9" fill="#F1F5F9"/>
          <text x="73" y="56" text-anchor="middle" font-size="8" fill="#64748B">inferred/unknown (禁折叠)</text>
        </g>
      </g>
    </g>

    <!-- Bottom summary tag in panel 1 -->
    <rect x="18" y="430" width="379" height="50" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="28" y="451" font-size="9" font-weight="700" fill="#334155">
      🌟 核心原则：消除代码内部自证偏见，将需求与真实环境彻底物理隔离。
    </text>
    <text x="28" y="468" font-size="8.5" fill="#64748B">
      只有确认目标环境存在该宿主时，才允许进入后续等价性核验。
    </text>
  </g>

  <!-- ==================== PANEL 2: CONTRACT & PROBES ==================== -->
  <g id="p2" transform="translate(462, 80)">
    <rect x="0" y="0" width="375" height="580" rx="14" fill="#FFFFFF" filter="url(#card-shadow)" stroke="#F1F5F9" stroke-width="1.5"/>

    <!-- Header Pill -->
    <rect x="18" y="16" width="28" height="22" rx="11" fill="#0284C7"/>
    <text x="32" y="31" text-anchor="middle" font-size="12" font-weight="800" fill="#FFFFFF">2</text>
    <text x="54" y="32" font-size="13" font-weight="800" fill="#0F172A">语义契约与 4 宿主实测探针</text>

    <!-- Semantic Contract Section -->
    <g transform="translate(18, 54)">
      <rect x="0" y="0" width="339" height="136" rx="10" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="1"/>
      <text x="14" y="20" font-size="11" font-weight="700" fill="#0369A1">语义契约模型构建 C (Contract Builder)</text>
      <text x="14" y="36" font-size="9" fill="#64748B">从语法上下文动态投影必须一致的离散语义维度：</text>

      <!-- 3 Pastel Dimension Pills -->
      <g transform="translate(14, 46)">
        <rect x="0" y="0" width="95" height="24" rx="12" fill="#FFFFFF" stroke="#0284C7" stroke-width="1"/>
        <text x="47" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="#0284C7">typeof 维度</text>

        <rect x="105" y="0" width="95" height="24" rx="12" fill="#FFFFFF" stroke="#0284C7" stroke-width="1"/>
        <text x="152" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="#0284C7">truthiness 维度</text>

        <rect x="210" y="0" width="100" height="24" rx="12" fill="#FFFFFF" stroke="#0284C7" stroke-width="1"/>
        <text x="260" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="#0284C7">return_val 维度</text>
      </g>

      <!-- Non-deterministic Trap Card -->
      <g transform="translate(14, 78)">
        <rect x="0" y="0" width="310" height="46" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1"/>
        <text x="10" y="16" font-size="9" font-weight="700" fill="#9F1239">非确定性语言内建拦截 (Date.now / Math.random):</text>
        <text x="10" y="32" font-size="8" fill="#BE123C">
          结果随时间/随机源波动 ➔ 强制要求 return_val 维度 ➔ 安全收敛至 UNKNOWN
        </text>
      </g>
    </g>

    <!-- 4-Host Empirical Probes -->
    <g transform="translate(18, 204)">
      <rect x="0" y="0" width="339" height="350" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="14" y="20" font-size="11" font-weight="700" fill="#0F172A">4 宿主自动化差分探针集群 (Empirical Probes)</text>

      <!-- 4 Host Floating Tiles -->
      <g transform="translate(14, 30)">
        <rect x="0" y="0" width="150" height="40" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="14" cy="20" r="4" fill="#64748B"/>
        <text x="24" y="17" font-size="9" font-weight="700" fill="#0F172A">纯 ECMAScript VM</text>
        <text x="24" y="29" font-size="7.5" fill="#94A3B8">求值基线 (Node vm)</text>

        <rect x="160" y="0" width="150" height="40" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="174" cy="20" r="4" fill="#0284C7"/>
        <text x="184" y="17" font-size="9" font-weight="700" fill="#0F172A">本地原生 Node.js</text>
        <text x="184" y="29" font-size="7.5" fill="#94A3B8">生产运行宿主 (v20+)</text>

        <rect x="0" y="48" width="150" height="40" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="14" cy="68" r="4" fill="#7C3AED"/>
        <text x="24" y="65" font-size="9" font-weight="700" fill="#0F172A">Headless 浏览器</text>
        <text x="24" y="77" font-size="7.5" fill="#94A3B8">MS Edge (DOM/BOM)</text>

        <rect x="160" y="48" width="150" height="40" rx="8" fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2"/>
        <circle cx="174" cy="68" r="4" fill="#059669"/>
        <text x="184" y="65" font-size="9" font-weight="700" fill="#0284C7">微信官方 DevTools</text>
        <text x="184" y="77" font-size="7.5" fill="#0284C7">SDK 3.17.3 (双执行面)</text>
      </g>

      <!-- Database Cylinder / Observation Cache -->
      <g transform="translate(14, 134)">
        <rect x="0" y="0" width="310" height="136" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1"/>
        <text x="12" y="20" font-size="10.5" font-weight="700" fill="#0F172A">差分实测证据库 E (Observation Database)</text>
        <text x="12" y="38" font-size="8.5" fill="#475569">• 实测基准覆盖：1,248 个实体快照 / 785 条跨环境实测差分</text>
        <text x="12" y="52" font-size="8.5" fill="#475569">• 观测四元组：⟨entityId, dimension, value, foldEligible⟩</text>
        <text x="12" y="66" font-size="8.5" fill="#475569">• 防伪哈希：SHA-256(SDK版本 | 探针源码 | 运行时环境指纹)</text>
        
        <rect x="10" y="80" width="290" height="42" rx="6" fill="#F1F5F9"/>
        <text x="18" y="96" font-size="8.5" font-weight="700" fill="#334155">自动失效机制 (Cache Invalidation):</text>
        <text x="18" y="110" font-size="8" fill="#64748B">SDK版本变更 · 环境指纹改变 · 契约版本升级 ➔ 强制证据过期</text>
      </g>

      <!-- Bottom Dynamic Verification -->
      <g transform="translate(14, 282)">
        <rect x="0" y="0" width="310" height="52" rx="8" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1"/>
        <text x="12" y="20" font-size="9.5" font-weight="700" fill="#166534">Level-2 观测等价性验证 (OBsmith §3.4 规范):</text>
        <text x="12" y="38" font-size="8.5" fill="#15803D">
          语料放行 1,338 点，真机动态验证 386 点，行为不一致率：<tspan font-weight="800">0.00%</tspan>
        </text>
      </g>
    </g>
  </g>

  <!-- ==================== PANEL 3: DECISION FUNNEL ==================== -->
  <g id="p3" transform="translate(852, 80)">
    <rect x="0" y="0" width="285" height="580" rx="14" fill="#FFFFFF" filter="url(#card-shadow)" stroke="#F1F5F9" stroke-width="1.5"/>

    <!-- Header Pill -->
    <rect x="18" y="16" width="28" height="22" rx="11" fill="#0284C7"/>
    <text x="32" y="31" text-anchor="middle" font-size="12" font-weight="800" fill="#FFFFFF">3</text>
    <text x="54" y="32" font-size="13" font-weight="800" fill="#0F172A">八步安全判定核心 D</text>

    <!-- Formula Bar -->
    <g transform="translate(14, 50)">
      <rect x="0" y="0" width="257" height="30" rx="15" fill="#0F172A"/>
      <text x="128" y="20" text-anchor="middle" font-family="monospace" font-size="10.5" font-weight="700" fill="#38BDF8">
        D(req, target, C, E) → { F, P, U }
      </text>
    </g>

    <!-- 8 Sequential Steps -->
    <g transform="translate(14, 90)">
      <!-- Step 1 -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="257" height="40" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="16" cy="20" r="9" fill="#E2E8F0"/>
        <text x="16" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="#475569">1</text>
        <text x="32" y="16" font-size="9" font-weight="700" fill="#0F172A">静态绑定合法性检验</text>
        <text x="32" y="29" font-size="8" fill="#64748B">若为 dynamic / 未解析 ➔ UNKNOWN</text>
      </g>

      <!-- Step 2 -->
      <g transform="translate(0, 46)">
        <rect x="0" y="0" width="257" height="40" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="16" cy="20" r="9" fill="#E2E8F0"/>
        <text x="16" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="#475569">2</text>
        <text x="32" y="16" font-size="9" font-weight="700" fill="#0F172A">契约确定性陷阱检查</text>
        <text x="32" y="29" font-size="8" fill="#64748B">若含 Date.now/Math.random ➔ UNKNOWN</text>
      </g>

      <!-- Step 3 -->
      <g transform="translate(0, 92)">
        <rect x="0" y="0" width="257" height="40" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="16" cy="20" r="9" fill="#E2E8F0"/>
        <text x="16" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="#475569">3</text>
        <text x="32" y="16" font-size="9" font-weight="700" fill="#0F172A">必需依赖明确性检验</text>
        <text x="32" y="29" font-size="8" fill="#64748B">存在依赖但非 definite ➔ UNKNOWN</text>
      </g>

      <!-- Step 4 -->
      <g transform="translate(0, 138)">
        <rect x="0" y="0" width="257" height="40" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="16" cy="20" r="9" fill="#E2E8F0"/>
        <text x="16" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="#475569">4</text>
        <text x="32" y="16" font-size="9" font-weight="700" fill="#0F172A">目标确认状态核准</text>
        <text x="32" y="29" font-size="8" fill="#64748B">未获强证实 (inferred) ➔ UNKNOWN</text>
      </g>

      <!-- Step 5 -->
      <g transform="translate(0, 184)">
        <rect x="0" y="0" width="257" height="40" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1"/>
        <circle cx="16" cy="20" r="9" fill="#E11D48"/>
        <text x="16" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="#FFFFFF">5</text>
        <text x="32" y="16" font-size="9" font-weight="700" fill="#9F1239">必需宿主缺失硬保护检验</text>
        <text x="32" y="29" font-size="8" fill="#E11D48">已确认目标完全缺失该能力 ➔ 硬 PROTECT</text>
      </g>

      <!-- Step 6 -->
      <g transform="translate(0, 230)">
        <rect x="0" y="0" width="257" height="40" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="16" cy="20" r="9" fill="#E2E8F0"/>
        <text x="16" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="#475569">6</text>
        <text x="32" y="16" font-size="9" font-weight="700" fill="#0F172A">探针证据时效与指纹匹配</text>
        <text x="32" y="29" font-size="8" fill="#64748B">无对应探针或指纹过期 ➔ UNKNOWN</text>
      </g>

      <!-- Step 7 -->
      <g transform="translate(0, 276)">
        <rect x="0" y="0" width="257" height="48" rx="6" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1"/>
        <circle cx="16" cy="24" r="9" fill="#059669"/>
        <text x="16" y="28" text-anchor="middle" font-size="9" font-weight="800" fill="#FFFFFF">7</text>
        <text x="32" y="18" font-size="9" font-weight="700" fill="#166534">契约维度观测投影比对 (strict_equal)</text>
        <text x="32" y="32" font-size="7.5" fill="#15803D">实测维度严格一致 | 任一冲突 ➔ PROTECT</text>
        <text x="32" y="42" font-size="7.5" fill="#DC2626">契约维度残缺 ➔ UNKNOWN</text>
      </g>

      <!-- Step 8 -->
      <g transform="translate(0, 330)">
        <rect x="0" y="0" width="257" height="40" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
        <circle cx="16" cy="20" r="9" fill="#E2E8F0"/>
        <text x="16" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="#475569">8</text>
        <text x="32" y="16" font-size="9" font-weight="700" fill="#0F172A">多目标一致性归约 (Target Aggregation)</text>
        <text x="32" y="29" font-size="8" fill="#64748B">全目标匹配且 foldEligible ➔ FOLD</text>
      </g>
    </g>

    <!-- Proof Guarantee -->
    <g transform="translate(14, 476)">
      <rect x="0" y="0" width="257" height="82" rx="8" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1"/>
      <text x="10" y="18" font-size="9" font-weight="700" fill="#B45309">判定保全定理 (Soundness Principle):</text>
      <text x="10" y="34" font-size="8" fill="#78350F">仅在多环境严格等价且证据完全可折叠时放行 FOLD；</text>
      <text x="10" y="48" font-size="8" fill="#78350F">任何外部未决、假定未明、或证据残缺，一律严格保守</text>
      <text x="10" y="62" font-size="8" fill="#78350F">收敛至 UNKNOWN（杜绝任何跨环境外推灾难）。</text>
    </g>
  </g>

  <!-- ==================== PANEL 4: TRI-STATE VERDICTS ==================== -->
  <g id="p4" transform="translate(1150, 80)">
    <rect x="0" y="0" width="258" height="580" rx="14" fill="#FFFFFF" filter="url(#card-shadow)" stroke="#F1F5F9" stroke-width="1.5"/>

    <!-- Header Pill -->
    <rect x="18" y="16" width="28" height="22" rx="11" fill="#0284C7"/>
    <text x="32" y="31" text-anchor="middle" font-size="12" font-weight="800" fill="#FFFFFF">4</text>
    <text x="54" y="32" font-size="13" font-weight="800" fill="#0F172A">三值出口与下游守护</text>

    <!-- 3 Verdict Cards -->
    <g transform="translate(14, 52)">
      <!-- FOLD -->
      <g id="v-fold" transform="translate(0, 0)">
        <rect x="0" y="0" width="230" height="66" rx="8" fill="#ECFDF5" stroke="#6EE7B7" stroke-width="1.2"/>
        <rect x="8" y="8" width="50" height="18" rx="9" fill="#059669"/>
        <text x="33" y="21" text-anchor="middle" font-size="9.5" font-weight="800" fill="#FFFFFF">FOLD</text>
        <text x="64" y="21" font-size="10" font-weight="700" fill="#065F46">等价安全放行</text>
        <text x="8" y="38" font-size="8" fill="#047857">• 证实目标环境与求值基线严格一致</text>
        <text x="8" y="50" font-size="8" fill="#047857">• 授权下游执行常量折叠与死分支消除</text>
        <text x="8" y="60" font-size="7.5" font-weight="700" fill="#059669">实测差分误放行：0 (Zero Unsafe Folds)</text>
      </g>

      <!-- PROTECT -->
      <g id="v-protect" transform="translate(0, 74)">
        <rect x="0" y="0" width="230" height="66" rx="8" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.2"/>
        <rect x="8" y="8" width="64" height="18" rx="9" fill="#E11D48"/>
        <text x="40" y="21" text-anchor="middle" font-size="9.5" font-weight="800" fill="#FFFFFF">PROTECT</text>
        <text x="78" y="21" font-size="10" font-weight="700" fill="#9F1239">冲突硬拦截</text>
        <text x="8" y="38" font-size="8" fill="#9F1239">• 实测证实环境存在异构冲突 (如 wx 差分)</text>
        <text x="8" y="50" font-size="8" fill="#9F1239">• 强制阻止折叠，保留完整分支与宿主调用</text>
        <text x="8" y="60" font-size="7.5" font-weight="700" fill="#E11D48">环境敏感分支拦截率：100.0%</text>
      </g>

      <!-- UNKNOWN -->
      <g id="v-unknown" transform="translate(0, 148)">
        <rect x="0" y="0" width="230" height="114" rx="8" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1.2"/>
        <rect x="8" y="8" width="70" height="18" rx="9" fill="#D97706"/>
        <text x="43" y="21" text-anchor="middle" font-size="9.5" font-weight="800" fill="#FFFFFF">UNKNOWN</text>
        <text x="84" y="21" font-size="10" font-weight="700" fill="#92400E">保守安全未决</text>
        <text x="8" y="38" font-size="8" fill="#78350F">证据不完备时保守兜底，输出细粒度归因：</text>

        <!-- Attributions -->
        <g transform="translate(8, 44)">
          <rect x="0" y="0" width="214" height="18" rx="4" fill="#FEF3C7"/>
          <text x="6" y="13" font-size="7.5" font-family="monospace" font-weight="700" fill="#92400E">binding</text>
          <text x="52" y="13" font-size="7.5" fill="#78350F">: 语法绑定未决 / 动态计算键</text>

          <rect x="0" y="22" width="214" height="18" rx="4" fill="#FEF3C7"/>
          <text x="6" y="35" font-size="7.5" font-family="monospace" font-weight="700" fill="#92400E">runtime</text>
          <text x="52" y="35" font-size="7.5" fill="#78350F">: 目标未证实 / 缺探针数据</text>

          <rect x="0" y="44" width="214" height="18" rx="4" fill="#FEF3C7"/>
          <text x="6" y="57" font-size="7.5" font-family="monospace" font-weight="700" fill="#92400E">behavior</text>
          <text x="52" y="57" font-size="7.5" fill="#78350F">: 契约维度缺失 / 不可折叠</text>
        </g>
      </g>
    </g>

    <!-- Downstream Integration -->
    <g transform="translate(14, 340)">
      <rect x="0" y="0" width="230" height="216" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="12" y="20" font-size="10.5" font-weight="700" fill="#0F172A">下游反混淆守门集成</text>

      <g transform="translate(10, 32)">
        <rect x="0" y="0" width="210" height="46" rx="6" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1"/>
        <text x="8" y="16" font-size="8.5" font-weight="700" fill="#166534">接收 [FOLD]：</text>
        <text x="8" y="30" font-size="8" fill="#15803D">放行！执行 AST 常量折叠与死分支剔除；</text>
        <text x="8" y="40" font-size="8" fill="#166534">代码体积精简，真实行为零偏差。</text>

        <rect x="0" y="86" width="210" height="72" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1"/>
        <text x="8" y="16" font-size="8.5" font-weight="700" fill="#9F1239">接收 [PROTECT] / [UNKNOWN]：</text>
        <text x="8" y="30" font-size="8" fill="#BE123C">强制拦截！保留原 AST 语法节点；</text>
        <text x="8" y="44" font-size="8" fill="#BE123C">杜绝误剪 typeof wx!=='undefined'；</text>
        <text x="8" y="58" font-size="7.5" font-weight="700" fill="#E11D48">防止微信/浏览器部署后核心功能丢失。</text>

        <rect x="0" y="166" width="210" height="24" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="0.8"/>
        <text x="105" y="16" text-anchor="middle" font-size="7.5" fill="#64748B">支持：webcrack / Terser / Babel</text>
      </g>
    </g>

    <path d="M 129 320 L 129 340" fill="none" stroke="#64748B" stroke-width="1.2" stroke-dasharray="3 3" marker-end="url(#pst-arr-blue)"/>
  </g>

  <!-- Global Footer -->
  <g transform="translate(32, 690)">
    <rect x="0" y="0" width="1376" height="42" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
    <text x="16" y="18" font-size="9.5" font-weight="700" fill="#0F172A">核心架构健全性公理 (Soundness Principles):</text>
    <text x="16" y="32" font-size="8.5" fill="#64748B">
      <tspan font-weight="700" fill="#0284C7">1</tspan>, 需求与目标正交解耦，中间防火墙杜绝循环推断；
      <tspan font-weight="700" fill="#0284C7">2</tspan>, 语义契约投影 + 4 宿主探针，支持 Level-2 形式化观测等价性验证；
      <tspan font-weight="700" fill="#0284C7">3</tspan>, 8 步递进漏斗引擎仅在严格等价时放行；
      <tspan font-weight="700" fill="#0284C7">4</tspan>, 守门人模型保护真实环境分支，实测实现 0 不安全折叠。
    </text>
  </g>
</svg>
'''

with open("docs/r97_academic_figure_generator_model.svg", "w", encoding="utf-8") as f:
    f.write(svg_pastel)

print("Saved modern pastel SVG.")

html_wrap = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#ffffff; width:1440px; height:760px; overflow:hidden; }}
</style>
</head>
<body>
{svg_pastel}
</body>
</html>'''

with open("docs/r97_academic_figure_generator_model.html", "w", encoding="utf-8") as f:
    f.write(html_wrap)

print("Saved modern pastel HTML.")
