# Image sources

Captured from Freelens 2.0.0 with this extension built from `main` (unreleased
UI after v2.0.0) and installed as a directory, cluster `kind-lan-dev`, dark
theme, a 1440 × 900 window, on 2026-11-07. The cropped images show the
extension page only, without the Freelens chrome. The skills in the cluster
map and skill captures are synthetic, written into the workspace for the
screenshots; the session and the demo are a real OpenCode 2.2.5 session.

| File | What it shows |
| --- | --- |
| `agentbridge-demo.gif` | The demo: open the page, pick OpenCode, browse the explorer, open a session, ask which pods have no resource limits. Recorded with a CDP screencast and an on-page cursor; the agent's work plays at 3× speed. 1080 px wide, 10 fps |
| `agentbridge-incident.gif` | The incident demo, recorded on 2026-11-08 in the same way: pick OpenCode, open a session, ask why the checkout pods in `shop-demo` keep restarting; the agent diagnoses, patches, restarts and verifies, then the dock goes fullscreen on its summary. `shop-demo` is synthetic: a namespace created for the recording with a misspelled ConfigMap key and a Service selector matching no pods, deleted afterwards. The recorder approved only read-only commands and changes scoped to `shop-demo`. The agent's work plays at 6× speed (4 fps), the first permission prompt and each change approval in real time (10 fps). 1080 px wide |
| `agentbridge-homepage.png` | The AgentBridge page, OpenCode ready, instructions open, full window |
| `agentbridge-session.png` | The OpenCode session in the dock with its answer, full window |
| `opencode-permission-settings.png` | The OpenCode guardrails open in the explorer, cropped |
| `agentbridge-intro.png` | The first visit to a cluster, no provider picked yet, cropped |
| `agentbridge-cluster-map.png` | "Build a cluster map", built, with its seeded command, cropped |
| `agentbridge-skill.png` | A namespace map skill selected in the explorer, cropped |
| `agentbridge-reset.png` | The Reset confirmation listing the files it restores, cropped |
| `agentbridge-not-installed.png` | Claude Code selected but not on the `PATH`, cropped |
