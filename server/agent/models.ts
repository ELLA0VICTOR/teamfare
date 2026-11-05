const response = await fetch("https://api.vultrinference.com/v1/models", {
  signal: AbortSignal.timeout(20000),
});
if (!response.ok)
  throw new Error(`Model list is unavailable (HTTP ${response.status}).`);
const data = (await response.json()) as {
  data: {
    id: string;
    output_modalities?: {
      type: string;
      supported_parameters?: Record<string, unknown>;
    }[];
  }[];
};
const models = data.data.filter((model) =>
  model.output_modalities?.some(
    (output) => output.type === "text" && output.supported_parameters?.tools,
  ),
);
console.log(
  "Current Vultr text models advertising tool calling (no API key needed for this list):",
);
for (const model of models) console.log(model.id);
