import type { ResearchOption } from "../research";

export function Evidence({ option }: { option: ResearchOption }) {
  return (
    <div className="evidence-block">
      <h3>Sources checked</h3>
      <p className="field-help">
        Public pages support the research. Availability, dietary suitability and
        final prices still need direct confirmation.
      </p>
      <ol>
        {option.sources.map((source) => (
          <li key={source.id}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title}
              <span aria-hidden="true"> ↗</span>
            </a>
            <span className="field-help">
              Read {new Date(source.fetchedAt).toLocaleDateString("en-GB")} ·{" "}
              {new URL(source.url).hostname}
            </span>
            <details>
              <summary>Show evidence excerpt</summary>
              <p>{source.excerpt}</p>
            </details>
          </li>
        ))}
      </ol>
      {option.costs.some((cost) => cost.basis === "published") && (
        <div className="price-quotes">
          <h3>Published figures</h3>
          {option.costs
            .filter((cost) => cost.basis === "published")
            .map((cost, index) => (
              <blockquote key={index}>
                <p>“{cost.quote}”</p>
                <span>
                  {cost.label} ·{" "}
                  <a
                    href={
                      option.sources.find(
                        (source) => source.id === cost.sourceId,
                      )?.url
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source
                  </a>
                </span>
              </blockquote>
            ))}
        </div>
      )}
    </div>
  );
}
