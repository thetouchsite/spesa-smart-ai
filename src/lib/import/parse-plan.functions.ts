/**
 * Server function: parse a user-supplied meal plan (text or file) into
 * `ImportedPlan`. Uses the Lovable AI Gateway (Gemini multimodal) so the
 * same endpoint handles pasted text, PDFs, DOCX-as-text and photos.
 *
 * The parser NEVER edits or "improves" the plan — its only job is to
 * extract the structure the user gave us.
 */
import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { ImportedPlanSchema } from "./imported-plan-schema";

const Input = z.object({
  text: z.string().default(""),
  file: z
    .object({
      name: z.string(),
      mime: z.string(),
      dataBase64: z.string(), // raw base64, no data: prefix
    })
    .nullable()
    .default(null),
  language: z.string().default("en"),
});

const PROMPT = `You are a strict meal-plan structural parser. The user has an existing meal plan (from a dietitian, coach, doctor, family recipe book, etc.) and wants to keep it EXACTLY AS-IS. Your ONLY job is to extract structure — never rewrite, translate ingredient names silently, add missing meals, or invent quantities.

Extract:
- days (Monday, Day 1, etc.)
- meals per day (type: breakfast/lunch/dinner/snack/other, name, ingredients with quantity)

Rules:
- Keep ingredient names in the ORIGINAL language of the plan.
- If a quantity is missing, use "" (empty string). Do NOT guess.
- If a meal chunk is unreadable or ambiguous, set unparsed=true and put the original text in rawText.
- If the plan uses "Day 1..7" instead of weekday names, keep it that way.
- Return valid JSON only.`;

export const parseImportedPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: `${PROMPT}\n\nUser language hint: ${data.language}` },
    ];
    if (data.text.trim()) {
      userContent.push({ type: "text", text: `Meal plan text:\n${data.text}` });
    }
    if (data.file) {
      const dataUrl = `data:${data.file.mime};base64,${data.file.dataBase64}`;
      if (data.file.mime.startsWith("image/")) {
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });
      } else {
        userContent.push({
          type: "file",
          file: { filename: data.file.name, file_data: dataUrl },
        });
      }
    }

    try {
      const { experimental_output } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        experimental_output: Output.object({ schema: ImportedPlanSchema }),
        messages: [
          { role: "user", content: userContent as never },
        ],
      });
      return experimental_output;
    } catch (err) {
      // Surface a compact error the client can render.
      const msg = err instanceof Error ? err.message : "Unknown parser error";
      throw new Error(`parse_failed:${msg.slice(0, 300)}`);
    }
  });
