/**
 * Typed application errors. The UI matches on `code` to render friendly
 * recovery flows (e.g. "your budget is too low — try this recommended one").
 */

export type AppErrorCode =
  | "BUDGET_TOO_LOW"
  | "NO_MEALS_FOR_STYLE"
  | "PRICING_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "AI_UNAVAILABLE"
  | "INVALID_INPUT";

export class AppError extends Error {
  code: AppErrorCode;
  meta?: Record<string, unknown>;
  constructor(code: AppErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

export class BudgetTooLowError extends AppError {
  recommendedBudget: number;
  minimumBudget: number;
  constructor(recommendedBudget: number, minimumBudget: number) {
    super(
      "BUDGET_TOO_LOW",
      `The current budget can't cover a nutritious basket. Recommended: ${recommendedBudget}.`,
      { recommendedBudget, minimumBudget },
    );
    this.recommendedBudget = recommendedBudget;
    this.minimumBudget = minimumBudget;
  }
}

export class PricingUnavailableError extends AppError {
  constructor(reason = "Live prices are temporarily unavailable.") {
    super("PRICING_UNAVAILABLE", reason);
  }
}

export function friendlyMessage(err: unknown): string {
  if (err instanceof AppError) {
    switch (err.code) {
      case "BUDGET_TOO_LOW":
        return "Your budget looks a little tight — we've suggested an optimised plan.";
      case "PRICING_UNAVAILABLE":
        return "We couldn't fetch live prices right now — showing our best estimate.";
      case "NO_MEALS_FOR_STYLE":
        return "We don't have meals for that style yet. Try another preference.";
      case "STORAGE_UNAVAILABLE":
        return "We couldn't save your plan. It's still in this session.";
      case "AI_UNAVAILABLE":
        return "Our smart planner is busy — using the offline engine instead.";
      case "INVALID_INPUT":
        return err.message;
    }
  }
  return "Something went wrong. Please try again.";
}
