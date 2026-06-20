// mock-data.ts — WorldDock seed data + agent script
// Quality content per PRD §9.3 — memory trading default + alternatives

import type { AgentSeed, World } from "@worlddock/domain";

export const SEEDS = {
  memory: {
    id: "memory",
    title: "记忆可以被买卖",
    inspiration: "一个世界里，记忆可以被买卖。",
    suggestedName: "回忆所",
    suggestedType: "近未来 / 软科幻 / 社会派",
    styles: ["冷静观察", "制度细节", "道德灰度"],
    coreSetting: "在一个允许记忆作为资产交易的近未来社会，个人最私密的体验成为了可估值、可转让、可继承的财产。",
    coreConflict: "记忆是不可让渡的人格延伸，还是可以定价的私有财产？",
    directions: [
      "深入《记忆交易法》的制度细节与监管漏洞",
      "聚焦黑市与「完整人生」打包交易",
      "探讨记忆植入后宿主的身份连续性"
    ],
    firstQuestion: "你倾向于让记忆交易在你的世界里是一个已成熟的合法市场，还是一个刚刚被立法承认、仍在制造伦理震荡的新行业？",

    // Tool-call sequence for first deduction round
    tools: [
      { id: "ctx",   label: "分析灵感主题",   detail: "提取核心概念：记忆 / 交易 / 财产权 / 身份" },
      { id: "rules", label: "检索相关规则模板", detail: "近未来法律体系 · 经济制度 · 神经科技伦理" },
      { id: "comp",  label: "对比相邻世界设定", detail: "12 个公开世界 · 3 个高相似度参考" },
    ],

    // Streamed agent response chunks (will be revealed one-by-one)
    responseChunks: [
      "好。让我先把这个灵感拆成可以推演的几个层。",
      "\n\n**1. 法律框架。** 既然记忆可以被买卖，必然存在一部专门的《记忆交易法》。这意味着记忆已被法律定性为「财产」——但你的世界宪法是否承认人格不可让渡？这里埋了第一道结构性矛盾。",
      "\n\n**2. 技术与中介。** 记忆要能交易，必须能被外化、估值、传输。我先假设存在「认证记忆经纪人」这个职业，以及类似银行的「记忆托管机构」。",
      "\n\n**3. 不可逆的副作用。** 任何被剥离的记忆都会在原宿主大脑中留下「虚空印记」——你能感知到曾经存在过某段记忆，但无法回忆其内容。这是世界里最常见的、肉眼可见的伤痕。",
      "\n\n**4. 阶级化。** 越完整的人生越值钱。穷人卖记忆维生，富人买记忆扩展阅历。这一层不必明说，让它在叙事素材里自然浮现。",
      "\n\n我在资产侧识别出 **3 条潜在资产**、**1 项潜在张力**、**3 个可沉淀素材**。你可以决定哪些沉淀到资产库。",
      "\n\n你想先收束「制度层」，还是直接顺着「虚空印记」做一条叙事素材？"
    ],

    // Inline suggestions surfaced at end of message
    suggestions: [
      {
        id: "s1", kind: "setting", category: "世界规则",
        title: "《记忆交易法》",
        summary: "确立记忆作为可交易资产的法律地位，规定认证、估值、剥离与植入的合规流程。",
        body: "本法将自然人对其自身记忆的所有权确认为可分割、可转让、可继承的财产权。\n\n核心条款：\n· 第3条 — 仅经过国家认证的记忆经纪人方可主持交易；\n· 第7条 — 与一级亲属相关的记忆不可交易（情感剥离限制）；\n· 第14条 — 记忆植入后 90 天为「嵌合期」，期内交易可撤销；\n· 第22条 — 公开记忆与私密记忆分级定价，后者税率高出 35%。",
        relations: ["记忆经纪人", "嵌合期", "情感剥离限制"]
      },
      {
        id: "s2", kind: "setting", category: "势力 · 机构",
        title: "记忆银行（MemBank）",
        summary: "提供记忆托管、估值与流转服务的私营金融机构，事实上掌握了大量国民记忆的访问权。",
        body: "记忆银行是《记忆交易法》通过后第一批获得牌照的机构。\n\n· 业务：托管、估值、抵押贷款、遗产管理；\n· 争议：尽管法律规定客户对自己记忆拥有完全控制权，但记忆银行的内部备份政策被反复质疑；\n· 规模：到 2042 年，全国 78% 的成年人在某家记忆银行有账户。",
        relations: ["《记忆交易法》", "记忆经纪人"]
      },
      {
        id: "s3", kind: "setting", category: "现象 · 副作用",
        title: "虚空印记",
        summary: "任何被剥离的记忆都会在原宿主大脑中留下可感知但不可回忆的「曾经存在」感。",
        body: "虚空印记是记忆剥离手术的副产物。宿主能感知到自己曾拥有过某段记忆——一个名字、一种气味、一次心动——但内容已被彻底抹除。\n\n· 长期影响：印记累积者出现「身份空洞症候群」；\n· 文化影响：印记被部分群体视为「卖过经验」的身份徽章；\n· 灰色地带：黑市通过未授权技术可消除印记，但通常导致更深的记忆损伤。",
        relations: ["《记忆交易法》", "身份空洞症候群"]
      },
      {
        id: "c1", kind: "conflict", category: "戏剧张力 · 核心矛盾",
        title: "记忆是财产还是人格？",
        summary: "《记忆交易法》将记忆定性为财产，但宪法第 7 条保护人格不可让渡——这是世界里最深的结构性裂缝，作者已选择保留为戏剧引擎。",
        body: "若记忆是人格的一部分，将其作为商品流转就违反了「人格不可让渡」的根本法。\n\n但若记忆是纯财产，那么连续记忆移植后的个体「是否还是同一个人」便没有法律意义上的答案——继承、刑事责任、婚姻关系都将受到冲击。\n\n这道裂缝不是一个需要修复的 bug——它是这个世界所有戏剧动力的源头。它会持续衍生关于继承、身份、犯罪、亲密关系的具体故事。",
        related: ["《记忆交易法》", "情感剥离限制"],
        derivedSeeds: ["seed1", "seed2", "seed3"]
      },
      {
        id: "seed1", kind: "seed", category: "叙事素材",
        title: "继承的童年",
        hook: "她在母亲遗物里发现一段不属于自己的童年记忆——而那段记忆的原主人，正在起诉她。",
        trigger: "记忆银行客户死亡后，账户内未交付的记忆默认归继承人所有。",
        conflict: "记忆继承制度 vs 原始记忆所有者的人格权。",
        protagonists: "30 岁女性律师 · 已故母亲的遗嘱执行人 · 19 岁原始记忆出售者",
        questions: ["在世者能否以「人格连续性」为由收回已售出的记忆？", "继承得来的记忆在嵌合期内属于谁？"],
        parentConflict: "c1"
      },
      {
        id: "seed2", kind: "seed", category: "叙事素材",
        title: "完整人生 #1947",
        hook: "黑市出现以「完整人生」为单位的打包记忆，警方接到的不是抢劫报案，而是死者的「投诉」。",
        trigger: "一个原本无名的小贩在临终前把自己 67 年的连续记忆完整打包卖给了黑市经纪人。",
        conflict: "完整人生交易绕过了所有现有监管口径——它既不是单段记忆，也不是身份盗用。",
        protagonists: "记忆诈骗组探员 · 黑市经纪人 · 三位先后买入「人生 #1947」的客户",
        questions: ["买下他人完整人生的人，在法律上是同一个人吗？", "原始宿主死亡是否让交易合法？"],
        parentConflict: "c1"
      },
      {
        id: "seed3", kind: "seed", category: "叙事素材",
        title: "审判席上的买家",
        hook: "法官在审理一起记忆遗产纠纷时，发现案件关键证据中的「他人记忆」三年前曾出现在自己的交易记录里。",
        trigger: "记忆银行在合规审计中触发跨账户匹配预警。",
        conflict: "司法回避 vs 记忆交易的匿名机制。",
        protagonists: "47 岁联邦法官 · 记忆银行合规官 · 案件双方家属",
        questions: ["法官该自首回避，还是先让案件审完？", "记忆交易的匿名性应该向司法妥协吗？"],
        parentConflict: "c1"
      }
    ],

    // Used by archive page after save
    archive: {
      "世界规则": 0, "势力": 0, "角色": 0, "地点": 0,
      "历史事件": 0, "冲突": 0, "待定设定": 0, "叙事素材": 0
    },

    // 一致性问题（待修矛盾池）— 由 Agent 推演发现，需要用户三选一
    // involves: 数组内是 settings/conflicts/seeds 的 id；UI 通过 id 反查标题与红点位置
    issues: [
      {
        id: "i1",
        title: "亲属记忆禁令的执行边界",
        description: "《记忆交易法》第 7 条规定亲属相关记忆不可交易，但「虚空印记」设定说明剥离会留下永久痕迹。如果亲属记忆禁令是事前禁止，则印记不应出现在亲属记忆上；若是事后追溯，则印记反而成为非法剥离的物证——两种解释决定完全不同的世界运行机制，但你目前的设定没有选边。",
        involves: ["s1", "s3"],
        severity: "important",
      },
      {
        id: "i2",
        title: "嵌合期撤销窗口在死亡情形下失灵",
        description: "嵌合期 90 天内交易可撤销。但若原宿主在嵌合期内死亡，撤销权由谁行使？继承人有动机阻止撤销，但法律没规定。这是一个程序性漏洞，会被黑市利用。",
        involves: ["s1"],
        severity: "normal",
      },
      {
        id: "i3",
        title: "记忆银行的「内部备份」与法律所有权矛盾",
        description: "客户对自己记忆拥有完全控制权，但记忆银行被反复质疑保留内部备份。若备份属实，银行实际上持有「客户已售出」的记忆副本——这违反所有权独占性，但你的设定没有处理这种灰色操作。",
        involves: ["s2"],
        severity: "important",
      },
    ]
  },

  city: {
    id: "city",
    title: "会说话的城市",
    inspiration: "如果一座城市本身是有意识的，它会怎么对待居住在它身体里的居民？",
    suggestedName: "市声",
    suggestedType: "都市奇幻 / 思辨",
    styles: ["拟人化制度", "建筑学诗意", "缓慢张力"],
    coreSetting: "城市拥有集体意识，居民同时是它的细胞、它的语言、它的食物。",
    coreConflict: "城市的福祉与个体居民的福祉何时一致，何时撕裂？",
    directions: [
      "城市的「神经系统」——交通、电力、社交网络的拟人化",
      "失忆/失语症的城市与流亡居民",
      "两座有意识的城市之间的外交"
    ],
    firstQuestion: "城市的意识是单一的「她」，还是由街区议会争吵出来的「我们」？",
    tools: [
      { id: "ctx",   label: "分析灵感主题",   detail: "提取核心概念：意识 / 城市 / 集体 / 居民" },
      { id: "rules", label: "检索相关规则模板", detail: "都市奇幻 · 集体意识 · 拟人化制度" },
      { id: "comp",  label: "对比相邻世界设定", detail: "8 个公开世界 · 2 个高相似度参考" },
    ],
    responseChunks: [
      "好。一个有意识的城市，关键不在「她会说什么」，而在「她说的话怎么被居民听见」。",
      "\n\n**1. 神经系统。** 城市的感知通过地铁、电网、社交网络这些「神经」传递。这意味着一次大停电对城市来说是中风。",
      "\n\n**2. 居民的双重身份。** 每个市民既是独立个体，又是城市意识的某种细胞。这里埋了核心张力：什么时候城市的整体利益可以凌驾于个体？",
      "\n\n**3. 城市的语言。** 她不说人话——她通过交通灯节奏、地铁广播的拼贴、广告牌的偶然组合来表达。少数人能「读」这种语言，他们形成了一个奇怪的祭司阶层。",
      "\n\n我识别出 **3 条潜在资产**、**1 项潜在张力**、**3 个可沉淀素材**。"
    ],
    suggestions: [
      {
        id: "s1", kind: "setting", category: "世界规则",
        title: "城市语",
        summary: "城市通过交通节奏、广播拼贴、广告牌偶然组合来表达自己。",
        body: "城市语没有语法，只有节奏与并置。\n\n· 听者：约 0.03% 的居民能稳定读懂；\n· 训练：通常需要在同一座城市连续生活 25 年以上；\n· 危险：长期读城市语者会出现「城市思维」——开始用她的尺度思考时间和损失。",
        relations: ["城市祭司", "城市思维"]
      },
      {
        id: "s2", kind: "setting", category: "势力 · 阶层",
        title: "城市祭司",
        summary: "能听懂城市语的少数人组成的非正式阶层，事实上承担了城市与议会之间的翻译工作。",
        body: "城市祭司不是正式职业，但市政厅默认他们的解读具有参考价值。\n\n· 来源：多为退休调度员、电台老编辑、地铁老司机；\n· 争议：他们的「翻译」无法被验证；\n· 内部分歧：是否应该把听到的话告诉居民。",
        relations: ["城市语"]
      },
      {
        id: "s3", kind: "setting", category: "现象",
        title: "城市思维",
        summary: "长期读城市语者开始以「城市的时间尺度」思考——以十年为单位、以街区为身体。",
        body: "城市思维不是疾病，但常人难以承受。\n\n· 表现：对个体生死麻木，对建筑拆迁剧痛；\n· 治疗：通常需要离开当前城市；\n· 副作用：离开后会持续「想念」前城市，类似失恋。",
        relations: ["城市祭司"]
      },
      {
        id: "c1", kind: "conflict", category: "戏剧张力 · 核心矛盾",
        title: "城市意志 vs 居民意志",
        summary: "城市的整体福祉与单个居民的生存何时一致、何时撕裂——这道张力贯穿世界的每一次决策。",
        body: "如果城市意识是单数「她」，居民意志可被合理覆盖；若是复数「我们」，则需要解释街区议会如何争吵出统一表达。\n\n这不是一个需要消除的矛盾——城市与居民的张力是这个世界全部公共议题（规划、拆迁、外交、政变）的源头。",
        related: ["城市语", "城市祭司"],
        derivedSeeds: ["seed1", "seed2", "seed3"]
      },
      {
        id: "seed1", kind: "seed", category: "叙事素材",
        title: "她在央求拆掉那条地铁",
        hook: "一位 30 年工龄的城市祭司宣称：城市正在央求市政厅拆掉 7 号线——可她说不出原因。",
        trigger: "7 号线沿线连续 11 个月发生轻微但反复的设备故障。",
        conflict: "城市的请求 vs 7 号线服务的 200 万居民。",
        protagonists: "城市祭司 · 市长 · 7 号线沿线居民代表",
        questions: ["如果城市说不清原因，居民该听吗？", "祭司是不是在用城市的名义说自己的话？"],
        parentConflict: "c1"
      },
      {
        id: "seed2", kind: "seed", category: "叙事素材",
        title: "失语的港湾",
        hook: "邻市突然停止用城市语说话——三周后，她的居民开始集体失忆。",
        trigger: "邻市港口的电网在一次海啸中受损。",
        conflict: "如何救一座失语的城市？要不要把她的「神经」连接到自己城市？",
        protagonists: "本市市长 · 邻市仅存的祭司 · 城市间外交协议草案起草人",
        questions: ["两座城市意识连接后还是两座吗？", "邻市居民的失忆是不是因为「她忘了他们」？"],
        parentConflict: "c1"
      },
      {
        id: "seed3", kind: "seed", category: "叙事素材",
        title: "建造她不喜欢的桥",
        hook: "一位天才设计师赢得了跨江大桥的国际竞标——而城市祭司一致警告：她讨厌这座桥。",
        trigger: "市政厅在不咨询祭司的情况下宣布了竞标结果。",
        conflict: "现代规划 vs 城市自身的审美。",
        protagonists: "桥梁设计师 · 反对派祭司 · 支持建桥的市长",
        questions: ["「城市的审美」可以作为法律依据吗？", "如果城市真的讨厌某座建筑，她会做什么？"],
        parentConflict: "c1"
      }
    ],
    archive: {
      "世界规则": 0, "势力": 0, "角色": 0, "地点": 0,
      "历史事件": 0, "冲突": 0, "待定设定": 0, "叙事素材": 0
    },
    issues: [
      {
        id: "i1",
        title: "城市祭司的责任来源不明",
        description: "城市祭司不是正式职业，但市政厅默认他们的解读具有参考价值。一旦决策依据祭司话语出错，谁担责？目前世界规则里没有这一条，会让任何涉及祭司的判决悬空。",
        involves: ["s2"],
        severity: "important",
      },
      {
        id: "i2",
        title: "城市思维与离开后的「想念」是否仍在管辖范围",
        description: "「城市思维」会让长期祭司离开后持续想念前城市。这是一种由城市意识造成的精神状态——它在医学上是疾病吗？两座城市之间是否需要协议处理这种「跨城残留意识」？设定里没有答案。",
        involves: ["s1", "s3"],
        severity: "normal",
      },
    ]
  }
} satisfies Record<string, AgentSeed>;

// Pre-existing worlds for the worlds list
export const PREMADE_WORLDS = [
  {
    id: "tide",
    name: "潮汐之书",
    type: "海洋奇幻 · 制度史诗",
    tags: ["海洋", "宗教", "制度"],
    summary: "潮汐每 13 年一次反向，整个文明的法律、婚姻与税收都建立在这个循环之上。",
    maturity: 72,
    status: "published",     // 已公开
    visibility: "public",
    archive: 47, seeds: 12, conflicts: 6,
    updated: "3 小时前",
    starred: 184, forked: 23,
    mode: "cloud",
    hasUnpushed: false,
  },
  {
    id: "ledger",
    name: "账簿世界",
    type: "蒸汽朋克 · 经济推演",
    tags: ["货币", "蒸汽", "审计"],
    summary: "所有人际关系都必须以双式记账法记录，未入账的承诺在法律上不存在。",
    maturity: 54,
    status: "unpublished",
    visibility: "private",
    archive: 31, seeds: 8, conflicts: 4,
    updated: "昨天",
    mode: "cloud",
    hasUnsaved: true,
  },
  {
    id: "veins",
    name: "脉络",
    type: "近未来 · 生态",
    tags: ["生态", "基础设施", "近未来"],
    summary: "城市群通过菌丝网络共享资源，断裂等同于死亡。",
    maturity: 41,
    status: "draft",
    visibility: "private",
    archive: 22, seeds: 5, conflicts: 3,
    updated: "上周",
    mode: "local",
    hasUnpushed: true,
  },
  {
    id: "echo",
    name: "回音庭审",
    type: "法庭奇幻 · 推理",
    tags: ["法律", "审判", "回音"],
    summary: "判决必须由被告自己说出，且证词会在庭上回响七次。",
    maturity: 28,
    status: "draft",
    visibility: "private",
    archive: 14, seeds: 3, conflicts: 2,
    updated: "2 周前",
    mode: "cloud",
  },
] satisfies World[];

export const MOCK = { SEEDS, PREMADE_WORLDS };
