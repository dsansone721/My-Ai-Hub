import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const CLAUDE_MODEL = "claude-sonnet-4-6";
const DALLE_MODEL = "dall-e-3";

const PROPERTY_TYPES = [
  "Garden Style",
  "Mid-Rise",
  "High-Rise",
  "Luxury Condo",
  "Senior Housing",
] as const;
const SETTINGS = [
  "Urban",
  "Suburban",
  "Waterfront",
  "Golf Course",
  "Mixed Use",
] as const;
const STYLES = [
  "Modern",
  "Traditional",
  "Mediterranean",
  "Contemporary",
  "Craftsman",
] as const;
const TIMES_OF_DAY = ["Day", "Golden Hour", "Dusk", "Night"] as const;
const ASPECT_RATIOS = ["16:9", "1:1", "9:16"] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number];
type Setting = (typeof SETTINGS)[number];
type Style = (typeof STYLES)[number];
type TimeOfDay = (typeof TIMES_OF_DAY)[number];
type AspectRatio = (typeof ASPECT_RATIOS)[number];

const SIZE_MAP: Record<AspectRatio, "1792x1024" | "1024x1024" | "1024x1792"> = {
  "16:9": "1792x1024",
  "1:1": "1024x1024",
  "9:16": "1024x1792",
};

const CLAUDE_SYSTEM_PROMPT = `You are a senior architectural visualization director writing prompts for DALL-E 3. The user gives you property specs; you produce ONE single-paragraph prompt of 90-160 words that yields a photorealistic, marketing-grade architectural rendering suitable for an institutional real-estate offering memorandum.

Required elements in every prompt:
- Camera & lens: name a specific perspective (e.g. "wide-angle exterior, eye-level, 24mm lens, slight low angle")
- Materials: call out facade materials, glazing, balcony rail systems, roof treatment
- Lighting: match the requested time of day (warm golden-hour rim light / cool blue-hour ambient / midday sun with crisp shadows / night with warm interior glow)
- Landscaping & street life: trees, planters, sidewalks, vehicles, people in scale (avoid named brands)
- Setting cues: ground the building in its context (urban / waterfront / golf-course / suburban) with consistent backdrop
- Atmosphere: weather, sky, and reflections that match time of day
- Quality cues at the end: "ultra-realistic architectural rendering, hyper-detailed, professional real-estate marketing photography, magazine quality, sharp focus, accurate proportions, ray-traced lighting, 8k"

Hard rules:
- Single paragraph, no bullet points, no markdown
- No copyrighted brands, no real-world signage, no recognizable people
- Do NOT describe interior rooms unless the user explicitly asked
- Do NOT mention text, logos, watermarks, or UI overlays
- Do NOT preface with "Here is" — output ONLY the prompt itself

Return ONLY the DALL-E prompt as a single paragraph of plain text.`;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  list: T
): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

type Body = {
  description?: string;
  property_type?: PropertyType;
  setting?: Setting;
  style?: Style;
  time_of_day?: TimeOfDay;
  aspect_ratio?: AspectRatio;
};

export type GenerateRenderingResponse = {
  image_url: string;
  prompt: string;
  size: "1792x1024" | "1024x1024" | "1024x1792";
  inputs: {
    description: string;
    property_type: PropertyType;
    setting: Setting;
    style: Style;
    time_of_day: TimeOfDay;
    aspect_ratio: AspectRatio;
  };
  generated_at: string;
};

export async function POST(req: NextRequest) {
  try {
    const parsed = await req.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") {
      return jsonError("Invalid JSON body.", 400);
    }
    const body = parsed as Body;

    const description = (body.description ?? "").trim();
    if (description.length < 8) {
      return jsonError("Provide a property description (at least 8 characters).", 400);
    }
    if (!isOneOf(body.property_type, PROPERTY_TYPES)) {
      return jsonError("Missing or invalid 'property_type'.", 400);
    }
    if (!isOneOf(body.setting, SETTINGS)) {
      return jsonError("Missing or invalid 'setting'.", 400);
    }
    if (!isOneOf(body.style, STYLES)) {
      return jsonError("Missing or invalid 'style'.", 400);
    }
    if (!isOneOf(body.time_of_day, TIMES_OF_DAY)) {
      return jsonError("Missing or invalid 'time_of_day'.", 400);
    }
    if (!isOneOf(body.aspect_ratio, ASPECT_RATIOS)) {
      return jsonError("Missing or invalid 'aspect_ratio'.", 400);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 500);
    }
    if (!process.env.OPENAI_API_KEY) {
      return jsonError("OPENAI_API_KEY is not configured on the server.", 500);
    }

    const inputs = {
      description,
      property_type: body.property_type,
      setting: body.setting,
      style: body.style,
      time_of_day: body.time_of_day,
      aspect_ratio: body.aspect_ratio,
    };

    // === Step 1: Claude writes the optimized DALL-E prompt ===
    let dallePrompt: string;
    try {
      const anthropic = new Anthropic();
      const userPrompt = [
        `Property description: ${description}`,
        `Property type: ${inputs.property_type}`,
        `Setting: ${inputs.setting}`,
        `Architectural style: ${inputs.style}`,
        `Time of day: ${inputs.time_of_day}`,
        `Aspect / framing: ${inputs.aspect_ratio} (${
          inputs.aspect_ratio === "16:9"
            ? "wide cinematic landscape"
            : inputs.aspect_ratio === "9:16"
              ? "tall vertical hero composition"
              : "balanced square hero shot"
        })`,
        ``,
        `Write the DALL-E 3 prompt now.`,
      ].join("\n");

      const claudeRes = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      dallePrompt = claudeRes.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")
        .trim();

      if (!dallePrompt) {
        return jsonError(
          `Claude returned no prompt (stop_reason: ${claudeRes.stop_reason}).`,
          502
        );
      }
    } catch (err) {
      console.error("[generate-rendering] Claude failed:", err);
      if (err instanceof Anthropic.AuthenticationError) {
        return jsonError("Invalid ANTHROPIC_API_KEY.", 401);
      }
      if (err instanceof Anthropic.RateLimitError) {
        return jsonError(
          "Rate limited by Anthropic. Try again in a moment.",
          429
        );
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonError(`Claude prompt generation failed: ${message}`, 502);
    }

    // DALL-E 3 caps prompts at 4000 chars; truncate defensively.
    const finalPrompt = dallePrompt.slice(0, 3900);
    const size = SIZE_MAP[inputs.aspect_ratio];

    // === Step 2: DALL-E 3 renders the image ===
    let imageUrl: string;
    try {
      const openai = new OpenAI();
      const imgRes = await openai.images.generate({
        model: DALLE_MODEL,
        prompt: finalPrompt,
        n: 1,
        size,
        quality: "standard",
        response_format: "url",
      });
      const url = imgRes.data?.[0]?.url;
      if (!url) {
        return jsonError("DALL-E returned no image URL.", 502);
      }
      imageUrl = url;
    } catch (err) {
      console.error("[generate-rendering] DALL-E failed:", err);
      if (err instanceof OpenAI.AuthenticationError) {
        return jsonError("Invalid OPENAI_API_KEY.", 401);
      }
      if (err instanceof OpenAI.RateLimitError) {
        return jsonError("OpenAI rate limit hit. Try again in a moment.", 429);
      }
      if (err instanceof OpenAI.BadRequestError) {
        return jsonError(
          `DALL-E rejected the prompt (likely a content-policy match): ${err.message}`,
          400
        );
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonError(`DALL-E call failed: ${message}`, 502);
    }

    const result: GenerateRenderingResponse = {
      image_url: imageUrl,
      prompt: finalPrompt,
      size,
      inputs,
      generated_at: new Date().toISOString(),
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-rendering] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}
