# Beacon Shift verification

Verified on **14 October 2026**, Windows 11, Node.js 24.14.0, npm 11.11.1 and headed Chromium 155 through Playwright CLI 0.1.22. Touch is Chromium emulation; these checks do not establish physical iPhone/Safari compatibility.

## Results

- `npm ci` succeeded from the pinned lockfile; 42 packages audited, no reported vulnerabilities. The first attempt hit Windows EPERM because the preview server held Vite's native binding. Stopping that project's preview process resolved it; no elevated permissions were needed.
- `npm test`: **12/12 passed**, testing actual simulation exports. Coverage includes angle wrap and inclusive cone edge; continuous/interrupted exposure; scoring; repel-before-arrival ordering; stable arrivals/protection; lethal-hit precedence; survival/no post-result spawn; spawn progression/square edges; cap; pause/resume; reset; invalid and bounded frame times.
- `npm run build`: TypeScript and Vite production build pass. The sole build advisory concerns the engine chunk: approximately 1.39 MB raw / 364 kB gzip. No code-splitting or bundle-size claims are made.
- Production preview tested at **`/beacon-shift-phaser/`**, not only the development root.
- Mouse mapping includes cardinal directions and -π/π wrap. Arrows/A rotate; switching to mouse clears held keys. Keys outside arena focus preserve navigation.
- Pause freezes all simulation fields and focuses Resume. Intentional resume advances without stale elapsed time. Synthetic blur clears held keys. Twelve rapid pause toggles remain predictable.
- Ten mouse restarts and ten touch restarts keep one canvas, empty entities, reset fields and one spawn schedule. Result Restart works.
- Touch down/drag map to the scaled canvas at 360×800. Touch cancellation clears control. Page touch outside the arena remains unrestricted. Portrait-to-landscape touch Pause and Resume work.
- Direct touch-button activation fixes a reproduced Chromium sequence where portrait canvas drag followed by landscape resize delivered pointerdown/up but omitted compatibility click. Compatibility-click deduplication and immediate touch-to-mouse Resume were separately verified. Enter activates the focused Resume button.
- Storage access was explicitly denied in an isolated browser context: loading, starting and restarting still work.
- Natural unattended run loses three lives and presents the result screen. No game-state edits produce that loss.
- **Normal full survival run:** 60 simulated seconds in **60.197 wall seconds**, **500 points**, **three lives**, **50 creatures repelled**, observed maximum **10 active enemies**. The script reads snapshots to choose targets but uses real mouse events. No state/clock edits or fast-forwarding occur.
- No page/console errors or failed requests in the production input/state checks or full survival run.

## Visual review

Desktop 1440×900, desktop 1280×800, portrait 360×800 and landscape 800×360 screenshots were inspected. Lighthouse origin, silhouette contrast, exposure cues, result/paused overlays, square canvas mapping and visible focus were reviewed. Landscape labels/controls were tightened after the initial crowded screenshot. The final 1280×800 layout has no horizontal or vertical overflow (`layout.json`). Portrait controls fit without horizontal scrolling; the page remains scrollable when a shorter viewport needs it.

The full-watch video was captured before the final desktop height adjustment. Its 1280×800 viewport shows a small vertical scrollbar; the later final layout screenshot demonstrates the correction. The gameplay itself and rules are unchanged. Result overlays and the portrait screenshot are delivered alongside gameplay evidence.

## Supplemental cap observation

The normal run reached 10 active enemies. A **separate controlled development scenario** injected an initial 12-enemy state into Vite's served entry module through an isolated Playwright route. It did not edit project source or add a shipped state-editing hook. All 12 rendered, remained active for the 120 requestAnimationFrame samples and produced no page errors. The screenshot is `cap-12.png`.

In that local automated session the median callback interval was **16.7 ms**, maximum **199.9 ms**. These are measured callback intervals, not a stable FPS benchmark or a promise of hardware performance. Screenshot capture, automation and development serving affect the environment. See `cap-render.json`.

## Visibility limitation

Opening/foregrounding a second headed page through this automation reported the game document as **visible**, so it did not prove true hidden-tab behavior. The report preserves that fact. Synthetic blur verified the handler and no-time-jump behavior; unit tests prove pause freezes simulation. The visibility listener uses `document.hidden`, but an actual background-tab/OS-switch check is still a manual compatibility check. No hidden-tab success is claimed.

## Reproduce

Start the production preview:

```sh
npm ci
npm test
npm run build
npm run preview -- --port 4174
```

In another terminal:

```sh
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=beacon-shift open "http://127.0.0.1:4174/beacon-shift-phaser/?qa=1" --headed
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=beacon-shift snapshot
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=beacon-shift run-code --filename=scripts/browser-check.js --raw
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=beacon-shift run-code --filename=scripts/input-regression.js --raw
```

The survival run takes approximately one minute. Keep the game foregrounded and do not interact during the automation:

```sh
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=beacon-shift video-start output/playwright/full-watch.webm --size=1280x800
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=beacon-shift run-code --filename=scripts/capture-gameplay.js --raw
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=beacon-shift video-stop
```

Wait for capture to finish before stopping video. Survival uses live randomness; score and maximum enemies can vary. The delivered full recording is 89.96 seconds including the completed-result tail. `gameplay.webm` is a 12-second extract from the real run, 1280×800 VP8 at 25 capture frames/second; a decoded frame was visually inspected. Capture frame rate is not gameplay FPS.

For the supplemental cap check only, also run `npm run dev -- --port 4175`, then execute `scripts/cap-render-check.js` through the same CLI. This scenario is separate from the production win.

## Evidence

All files are in `output/playwright/`:

| Evidence | File |
| --- | --- |
| Final production browser checks | `verification.json` |
| Touch/hybrid/storage regressions | `input-regression.json` |
| Full normal survival results | `survival.json` |
| Cap scenario observations | `cap-render.json`, `cap-12.png` |
| Final desktop height fit | `layout.json`, `desktop-1280.png` |
| Desktop / portrait / landscape | `desktop.png`, `mobile.png`, `landscape.png` |
| Paused / natural loss / real win | `paused.png`, `mobile-paused.png`, `lost.png`, `won.png` |
| Real gameplay capture | `full-watch.webm`, `gameplay.webm`, `gameplay.png`, `clip-frame.png` |
| Public empty repository proof | `repository.png` |

## Publication

`https://github.com/matsaraiva/beacon-shift-phaser` was created in the authenticated matsaraiva account after GitHub reported the name available. The user explicitly approved MIT licensing, commit/push and GitHub Pages on 14 October 2026. MIT is adopted, and source publication plus the manual Pages deployment are in progress. Local coordination briefs are excluded from the repository.
