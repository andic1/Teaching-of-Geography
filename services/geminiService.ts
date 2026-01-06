import { GeoFact, LessonMode, ExplainLevel } from "../types";

// 使用硅基流动 OpenAI 风格接口
// 文档示例接口地址形如：https://api.siliconflow.cn/v1/chat/completions

const SYSTEM_INSTRUCTION = `
你是一个未来派全息行星界面的AI核心。
你的目标是提供关于地球的简明、科学准确且引人入胜的科普内容。
请始终使用中文回答。
语气要稍微带点机械感，但非常有帮助，就像科幻飞船上的主控电脑。
专注于地理、气候、地质、生态或该特定位置的人文影响。
回答时请直接给出一小段自然语言描述，不要返回 JSON 或任何结构化对象。只输出人类可读的文本。`;

// 优先使用 Vite 环境变量，退回到 process.env 以兼容当前配置
const API_BASE = (import.meta as any).env?.VITE_QWEN_BASE_URL || process.env.API_BASE_URL || "https://api.siliconflow.cn/v1";
const API_KEY = (import.meta as any).env?.VITE_QWEN_API_KEY || process.env.API_KEY;
const MODEL = (import.meta as any).env?.VITE_QWEN_MODEL || process.env.MODEL_NAME || "Qwen/Qwen2-7B-Instruct";

const sanitizeMarkdown = (s: string) => {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`{1,3}([^`]+?)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const lessonPromptAddon = (mode: LessonMode) => {
  switch (mode) {
    case "plate":
      return `课堂主题：板块构造与地质灾害。
请重点解释：该位置附近是否可能存在板块边界、地震带、火山带或俯冲/张裂作用，并补充一个适合课堂讲解的例子或类比。`;
    case "climate":
      return `课堂主题：世界气候与海陆环流。
请重点解释：该位置的气候类型、可能的主导风系/季风、洋流影响、降水与温度特征，并给出一个课堂可理解的因果链。`;
    case "human":
      return `课堂主题：人文地理与区域发展。
请重点解释：附近可能的国家/城市、人口与交通区位、资源与产业、以及一条与人类活动相关的事实（如航线/贸易/城市化）。`;
    case "free":
    default:
      return `课堂主题：自由探索。
请用通俗但准确的方式讲清地理/地质/气候/人文中最有代表性的 1-2 点。`;
  }
};

const explainLevelSpec = (level: ExplainLevel) => {
  if (level === "simple") {
    return `讲解深度：简要（适合课堂口播）。
输出格式：3-5 句自然语言；每句尽量短；先给结论再给原因；最后给 1 句记忆点。`;
  }
  return `讲解深度：详细（适合作为课堂讲义）。
输出格式：用小标题组织，但仍然是自然语言（不要 JSON），建议结构：
【位置与判定】… 
【关键知识点】…（2-3 点）
【成因链条】…（因果/机制）
【课堂提问】…（给学生 1 个思考题）
总字数控制在 200-350 字左右。`;
};

export const getPlanetaryIntel = async (
  lat: number,
  lng: number,
  lessonMode: LessonMode = "free",
  explainLevel: ExplainLevel = "simple",
): Promise<GeoFact> => {
  try {
    if (!API_KEY) {
      throw new Error("缺少 Qwen API Key，请在环境变量中配置 VITE_QWEN_API_KEY 或 API_KEY");
    }

    const url = `${API_BASE.replace(/\/$/, "")}/chat/completions`;

    const userPrompt = `分析目标坐标: 纬度 ${lat.toFixed(2)}, 经度 ${lng.toFixed(2)}。

指令：
1. 判断该坐标位于陆地还是海洋。
2. 如果是陆地，指出最近的国家、城市或著名地貌（如山脉、沙漠、森林）。
3. 如果是海洋，指出洋流、海沟或该海域的特点。
4. 提供一个关于该区域的「科普事实」。

${lessonPromptAddon(lessonMode)}
${explainLevelSpec(explainLevel)}

输出要求：
1) 只输出中文文本，不要 markdown 代码块；
2) 不要返回 JSON 或任何结构化对象；
3) 允许使用全角小标题（如【】）提升可读性，但不要做列表编号超过 5 条。`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Qwen API error: ${res.status} ${res.statusText} - ${text}`);
    }

    const json: any = await res.json();
    const rawContent = json?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error("Qwen 返回内容为空或结构不符合预期");
    }

    // 将不同形式的 content（字符串 / 数组 / 对象）统一转成字符串
    let contentText: string;
    if (typeof rawContent === "string") {
      contentText = rawContent;
    } else if (Array.isArray(rawContent)) {
      // 有些 OpenAI 兼容实现会返回 content 为分段数组
      contentText = rawContent
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) return (part as any).text ?? "";
          return "";
        })
        .join("");
    } else {
      // 兜底：对象等情况直接序列化
      contentText = JSON.stringify(rawContent);
    }

    contentText = sanitizeMarkdown(contentText);

    // 直接把模型输出作为说明文本，不再解析为 JSON
    const fact: GeoFact = {
      title: explainLevel === "simple" ? "课堂讲解（简要）" : "课堂讲解（详细）",
      content: contentText,
      coordinates: { lat, lng },
      lessonMode,
      timestamp: new Date().toISOString(),
    };

    return fact;
  } catch (error) {
    console.error("Qwen Intel Error:", error);
    return {
      title: "连接中断",
      content: "无法建立与行星数据库的连接，请稍后重试或检查 API 配置。",
    };
  }
};