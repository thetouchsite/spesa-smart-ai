/**
 * Copilot service — stub.
 *
 * Future wiring:
 *   • Move this into a `createServerFn` that calls the Lovable AI Gateway.
 *   • Pass `CopilotRequest`, return `CopilotResponse`.
 *   • Use the intent to pick a prompt template and tool-use schema.
 *
 * Keep the public function shape stable so the UI can be built ahead of
 * the model integration.
 */

import type { CopilotRequest, CopilotResponse } from "./types";

export async function askCopilot(_req: CopilotRequest): Promise<CopilotResponse> {
  // TODO: wire AI Gateway (google/gemini-3-flash-preview or similar) here.
  return {
    ok: false,
    message: "AI Copilot is coming soon. This is a placeholder response.",
  };
}
