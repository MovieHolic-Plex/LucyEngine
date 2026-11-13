# Roadmap

LucyEngine today is a working experiment: one sentence becomes one playable scene, and you can keep editing it by talking or by hand. This document is about the distance between that and a framework other people can build games on, and the order we think the work should go in.

Nothing here is promised or dated. It is a statement of direction.

## Where it stands

| Works | Does not exist yet |
|---|---|
| One scene per project: terrain, props, buildings, characters, enemies, lights, dialogue, simple events | Several scenes, doors between them, persistent state, quests, inventory, saving |
| Chat-driven editing with undoable change cards; hand editing (move, duplicate, delete, inspector, brush, lights, dialogue) | A script escape hatch for behaviour the presets do not cover |
| Art generated per request, conditioned on a style document and snapped to a shared palette | Art that looks drawn by one hand; real animation; non-repeating ground |
| Ambient + point lights, bloom, vignette | Lighting that reacts to the shape of sprites |
| Unit tests, browser end-to-end tests, an eval runner with structural grading | Visual grading; a public plugin API; packages on npm; exporting a standalone game |

## 1. Art that holds together

This is the largest gap between the current output and the hand-made look the project is aiming for, so it comes first.

**The problem.** Each sprite is generated on its own, so detail level and proportions vary from one to the next. Characters get three drawn views and a walk cycle faked by shifting pixels. Ground is one small tile repeated. Lights are flat discs multiplied over the scene.

**Directions, roughly in order of payoff:**

1. **A project style anchor.** Generate one reference sheet per project (a character, a prop, a wall, a patch of ground) and condition every later image on it, so the set reads as one artist's work. An early attempt leaked the reference subject into other sprites; it needs a reference that shows style without a dominant subject.
2. **Ground that does not repeat.** Larger textures, variant tiles chosen by position, and a decal layer (cracks, tufts, puddles, tyre marks) placed by the agent. Proper transition tiles between materials instead of a noise-blended edge.
3. **Real animation.** Either pose-conditioned frames from the image model, or a hybrid: the image model draws the look, and a rig drawn in code supplies the motion. The repository already has an experimental code-drawn pipeline (`packages/assets/src/hand`, `scripts/draw-llm.ts`) in which a language model writes pixel-placing code; it produces consistent sets and true walk frames in under two minutes, at the cost of painterly detail. Combining the two is the interesting path.
4. **Lighting with form.** Derive normal maps from sprites so lamps light the side that faces them, add coloured shadows and rim light.
5. **Denser scenes.** Teach the agent composition: overlapping clusters, walls and fences that frame space, foreground elements that occlude.

## 2. From a scene to a game

1. **Many scenes** and doors between them; a project map view.
2. **State**: flags that persist across scenes, quests, an inventory, saving and loading.
3. **A narrow script escape hatch**: sandboxed behaviour scripts for what presets cannot express. The document schema already reserves the field.
4. **Cut-scenes**: a small timeline on top of the existing event actions.

## 3. A framework surface

1. **A stable, versioned document schema** with migrations, documented as the contract.
2. **A plugin API** with three extension points: asset providers (bring your own image model or art pack), behaviours, and agent tools.
3. **Packages on npm** (`model`, `runtime`, `agent`) and a CLI: create, run, evaluate, export.
4. **Standalone export**: a static web build of a project that needs no server and no editor.
5. **Localisation** of the editor UI (it is Korean today).

## 4. Agent quality and cost

1. **Visual evals**: grade scenes by how they look, not only by whether they work.
2. **Faster first results**: draw what the scene needs first and show it while the rest is still generating; reuse art across projects.
3. **Cheaper turns** for small edits.

## 5. Platform

Accounts, share links, simultaneous editing that merges gracefully, a desktop build, touch input.

## How to help

The most valuable contributions right now are in section 1. If you try something there, open an issue with before/after pictures of the example scene: `scripts/hand-project.ts` swaps an art set into it so results are directly comparable.
