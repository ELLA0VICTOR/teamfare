import type { Plan } from "../data";
import { stageOf, stages } from "../plan";

export function RouteLine({
  plan,
  compact = false,
}: {
  plan: Plan;
  compact?: boolean;
}) {
  const current = stageOf(plan);
  if (current < 0)
    return (
      <span className="status-text">
        <i />
        Cancelled
      </span>
    );
  return (
    <div
      className={`route-line ${compact ? "route-compact" : ""}`}
      aria-label={`Step ${current + 1} of 5: ${stages[current]}`}
    >
      <span className="route-mobile-label">
        Step {current + 1} of 5 · {stages[current]}
      </span>
      <ol>
        {stages.map((stage, index) => (
          <li
            key={stage}
            className={
              index < current ? "complete" : index === current ? "current" : ""
            }
            aria-current={index === current ? "step" : undefined}
          >
            <span className="route-tick" />
            <span className="route-name">{stage}</span>
          </li>
        ))}
      </ol>
      {compact && (
        <span className="route-compact-label">{stages[current]}</span>
      )}
    </div>
  );
}
