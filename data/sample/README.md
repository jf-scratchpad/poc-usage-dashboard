# Sample data (fictional)

**FICTIONAL SAMPLE DATA.** Nothing in this folder was collected from a real
account. There are no real subscription IDs, emails, tokens, or hardware
identifiers. Subscription and resource IDs use the obviously fake placeholder
`00000000-0000-0000-0000-000000000000`.

The files cover about 12 weeks, from 2026-08-31 through 2026-11-22, with
weekday/weekend variation, a gentle upward trend, and a few invented spikes
(mid-September Azure OpenAI, mid-October coding push, mid-November pre-trial
week). They are shaped like each source's native export so the adapters
exercise realistic parsing.

| File | Native shape | What a row is |
| --- | --- | --- |
| `grok-bot-usage.json` | Invented Grok Bot usage export (JSON) | One day × one assistant (requests, credits, cost) |
| `cursor-usage.csv` | Invented Cursor admin usage export (CSV) | One day × project × kind/model event (requests, tokens, cost) |
| `azure-cost-management.csv` | Invented Azure Cost Management daily actual-cost export (CSV) | One day × resource/meter line (`PreTaxCost`, tags, quantity) |

CSV files start with `#` comment lines stating they are fictional; the
adapters skip those lines. The Grok Bot JSON file carries a `disclaimer`
field with the same notice.
