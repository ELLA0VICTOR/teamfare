# Vultr credits and planning-agent keys

Checked against official pages on 4 November 2026. Account screens and model availability can change.

## 1. Claim the hackathon credit

1. Sign in to LabLab with your participating account and open [Claim Your $200 Vultr Credits](https://lablab.ai/redeem-coupon/vultr-ai-coupon-vultr-agent-rush-hackathon).
2. Follow its redemption instructions. The [event page](https://lablab.ai/ai-hackathons/vultr-hackathon) specifies an email address that has not previously been associated with a Vultr account.
3. Create the Vultr account, verify its email, then open the [hackathon Billing promotion](https://console.vultr.com/billing/?promo=HACKATHON).
4. Select **Gift Code** in the payment-method menu, enter the code supplied by LabLab, and complete redemption there. Confirm **$200.00 Remaining Credit** in Billing. In this project's setup, a promotion shown beside the card-payment form still left account activation blocked; redemption through the separate Gift Code section resolved it.

The public event page does not explicitly confirm whether the promotion covers Serverless Inference subscriptions. Check the inference billing screen or ask the organisers before accepting a paid subscription. Cloud Compute credits and inference API access should not be assumed to be the same entitlement.

## 2. Get the inference key and model

Open [Vultr Serverless Inference](https://console.vultr.com/inference/), follow its account activation prompts, and create an inference subscription. Click its name, open **Overview**, and copy **API Key**. Use the key for Serverless Inference, rather than the general infrastructure-management API key. See [official key retrieval instructions](https://docs.vultr.com/products/compute/serverless-inference/management/connection) and [authentication documentation](https://api.vultrinference.com/docs/get-started/authentication).

List currently advertised tool-calling models without an API key or a paid inference request:

```sh
npm run agent:models
```

`qwen3.8-flash-next` appeared in that public list when checked. Its presence is not proof that your particular account can use it; a real authenticated run is still required.

## 3. Get the search key

Create an account at [Tavily](https://app.tavily.com/) and copy a dashboard API key. [Tavily's documentation](https://docs.tavily.com/) currently advertises 1,000 free API credits monthly without a credit card. Teamfare calls Search and Extract directly from its server; no browser extension or MCP installation is needed.

## 4. Configure Teamfare

Copy `.env.example` to `.env` if the file does not already exist. Preserve existing settings and fill these three entries in `C:\Users\kolev\Desktop\teamfare\.env`:

```dotenv
VULTR_INFERENCE_API_KEY=your_inference_key
VULTR_INFERENCE_MODEL=qwen3.8-flash-next
TAVILY_API_KEY=your_tavily_key
```

Restart `npm run dev` after editing the environment file. On Windows, use `npm.cmd` if needed. Do not paste keys into chat, commit `.env`, or use `VITE_` variables for secrets. Compose passes these settings to the server at runtime; they are not build arguments.

## 5. Verify with a real run

Sign in to a real team, describe an outing of at least ten characters, choose a future date, location, headcount and per-person allowance, and select **Research options**. The agent searches and reads public pages, then compares two or three sourced options. Provider errors appear as failures; sample venues are never substituted for failed research.

Inspect the linked sources, cost assumptions and questions still requiring confirmation. **Use this plan** creates a draft. Edit its headcount, costs, itinerary and named teammates before submitting it for a different manager's approval. Approval never books a venue. With guest email enabled, authenticated approval queues invitations for opted-in named teammates; the research model cannot send them.

Missing keys are reported by name without revealing values. For credential/access errors, check the corresponding provider dashboard. For credit/rate-limit errors, check billing before retrying. Cancelled runs can still incur charges for provider work already started.

Runs are bounded to three minutes, twelve model turns (the last three reserved for submission/correction), four searches and three extraction calls of at most four URLs each. Completions require tool calls and have an 8,192-token limit including a 1,024-token reasoning budget at low effort. Choose a model supporting those reasoning controls; the configured Qwen model advertises budget support. Truncated output is rejected. Each user can start four runs per hour, one at a time; the process permits two concurrent runs. Persistent daily UTC limits also allow ten starts per team and twenty across the deployment. These are usage limits, not a guaranteed currency spending cap. Check provider usage dashboards.

## Verification status

Automated tests use clearly labelled deterministic provider fixtures and mocked HTTP responses. They verify application behaviour without paid calls. On 4 November 2026, a separate browser check used real locally configured Vultr/Tavily credentials: four searches, two extraction calls and three sourced venue options, followed by draft selection, persistence and manager approval. It completed in about 53 seconds including browser setup and approval. The run used isolated verification accounts and a separate ignored database; it did not add data to the user's team. Screenshots and a sanitized report are under `.artifacts/live-providers/` locally. This verifies provider access and one real workflow, not general model reliability or how Vultr allocated the usage against promotional credit.

A subsequent real run from the deployed Vultr VM completed after correcting output-budget issues and explicitly retrying a provider timeout. It returned three sourced choices and passed the full review/expense workflow. See [deployed verification and limitations](DEPLOYMENT.md).
