import { GeoFact } from "../types";

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

export const getPlanetaryIntel = async (lat: number, lng: number): Promise<GeoFact> => {
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

请直接用 2-4 句中文自然语言描述回答，不要返回 JSON 或任何键值对结构。`;

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

    // 直接把模型输出作为说明文本，不再解析为 JSON
    const fact: GeoFact = {
      title: "行星情报",
      content: contentText,
      coordinates: { lat, lng },
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