# Timeline War — play rating

**7.4 / 10.** A real lane game with a pretty battlefield and a careful simulation, scored as if the previous 10/10 self-review had never been written. The engineering is ahead of the first five minutes.

Played and read against the current build (campaign select, Stone through Modern, the headless balance harness, and the live playtest frames in `docs/playtest/`). Not a marketing pass.

## Scores

| | | Why |
| --- | --- | --- |
| Backdrop and age fantasy | 8.6 | The three panoramas sell a timeline. Towers finally read as towers. |
| Units in a fight | 6.8 | Individuals are readable. A clump is still a pile, and the damage numbers made it worse. |
| HUD | 6.0 | Every system has a button. The only status line was a hotkey encyclopedia. |
| Counter triangle | 7.8 | Swarm / tank / ranged is the game, and it works. Nothing on screen taught it. |
| First five minutes | 5.4 | Coach said "Clubman". The button says CLUBBER. Then it jumped to evolve and meteor. |
| Menu honesty | 5.8 | ENDLESS SKIRMISH started the highest unlocked campaign stage and could write stars. |
| Combat feedback | 6.2 | Crit labels stacked on one pixel. War Cry was a modal over the vista plus a full-screen flash. |
| Technical craft | 9.1 | Deterministic sim, art contract, campaign rules under test. This is the part that is actually a 9. |
| One more match | 7.2 | The push-and-evolve loop is fun once you already know it. |

## What a first player actually hits

1. **The skirmish button lied.** `MenuScene` remapped stage id 0 to `min(5, unlocked)`. GameScene treats 0 as the unranked skirmish and does not call `recordResult`. The menu never passed 0, so "UNRANKED" was a campaign stage in disguise.
2. **The triangle was a secret.** Swarm beats ranged, ranged beats tank, tank beats swarm. The coach's first line was `Deploy a Clubman (Key 1)` — wrong name, no reason. The idle subtitle listed every hotkey and never said why key 1 exists.
3. **A fight became unreadable at the moment it got interesting.** Every hit spawned its own `CRIT!` with random scatter, its own sting, and its own shake. Six clubbers on one tick painted six labels on one body. The War Cry banner sat in the middle of the painted sky at 520×68, and a camera flash washed the lane that had just been buffed.
4. **The results footnote lied on the way out.** A cleared skirmish and a cleared final stage both said "Press ENTER for the next level". Enter restarted.

## What this is not

It is not a broken prototype. Bases, ages, turrets, ultimates, collapse tiebreaks and a five-stage campaign are all real, and the sim stays deterministic. The 10/10 in `SELF_REVIEW.md` is the score of the engineering checklist, not of a first session. A portal player bouncing off in ninety seconds never sees the tiebreak hierarchy.

## Left on the table

Not in the pass that follows this rating, on purpose:

- The painted panorama and the procedural units are still two art styles sharing a lane.
- War Cry, Time Warp, reinforcements, forge, armor, turret and ultimate are a lot of verbs for minute one.
- `public/voice/` has no `war_cry.mp3` or `chrono_surge.mp3`, so those callouts fall through to OS speech and break the announcer.
- The bottom bar is a desktop keyboard layout squeezed into 78px. A phone can tap it. It cannot enjoy it.
- Crowd spacing is a sim contract (`FRIENDLY_SEPARATION` 14). Do not "fix" readability by widening it.

## After the injected pass

The four defects above are fixed in this tree. Re-score for those slices: first five minutes 7.0, menu honesty 8.0, combat feedback 7.6. Overall **7.9 / 10**. The leftover list is why it is not an 8.5.
