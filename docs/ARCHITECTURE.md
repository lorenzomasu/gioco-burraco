# Architecture

## Overview

This project implements Burraco in TypeScript and React.

The architecture separates the deterministic game/domain layer from the React UI.

Game rules and state transitions belong under `src/game`.
React components render state, collect player intent, and invoke the game engine.

## Repository structure

- `src/game/cards` — physical card model, deck creation, stable card identities, and deterministic shuffling support.
- `src/game/state` — immutable `GameState` types for players, teams, melds, piles, pozzetti, turn state, and round status.
- `src/game/engine` — deterministic game commands and state transitions.
- `src/game/melds` — pure meld validation and Burraco classification.
- `src/game/scoring` — pure round-scoring logic.
- `src/game/match` — four-round match lifecycle, settled round history, cumulative totals, Match Points, and Victory Points.
- `src/game/bot` — deterministic bot candidate generation, ranking, and turn execution.
- `src/components` — React UI for human and bot-controlled seats.

Tests live next to the code they cover as `*.test.ts` or `*.test.tsx`.

## Game engine invariants

The game engine must remain deterministic for the same input state and explicit random source.

Prefer pure functions and immutable state transformations.

Illegal commands must not partially mutate game state.

Use the existing typed `GameRuleError` mechanism for game-rule violations where appropriate.

Game-rule legality must be decided by the engine, not by React components or bot strategy.

## Card identity

Physical card identity must be preserved.

Equivalent cards from the two decks are not interchangeable when a command or state transition refers to a specific card.

Do not replace physical cards with abstract rank/suit representations when state mutation requires the original card.

## Melds

Meld validation and Burraco classification are derived behaviour.

Validated meld logic must preserve the original physical cards and their semantic roles.

New-meld validation through `validateMeld`, `validateSequence`, and `validateGroup`
is stateless. Extending a stored meld uses the separate pure history-aware extension
validator, which reuses stateless validation and then enforces the prior represented
position of any already-active sequence wildcard.

Do not persist derived classification into state unless a future milestone explicitly changes this architecture.

Wildcard semantics must remain consistent with `docs/RULES.md` and the existing validator tests.

## Bots

Bots use the same engine APIs and legality checks as human players.

Bot behaviour must remain deterministic for the same visible game state.

Bots may not inspect hidden opponent hands, future draw-pile order or identity, or pozzetti that have not yet been taken.

Candidate generation may propose moves, but the engine remains authoritative for legality.

Bot heuristics that predict whether a visible card extends an existing meld use the
same history-aware extension validator as the engine.

Do not duplicate game-rule validation inside bot strategy code.

Bot public action events are transient execution metadata produced only by the bot
orchestration layer after successful engine transitions commit. They are not stored
in `GameState` or `MatchState`. React may retain and render these events for the
current smazzata, but must not infer them by diffing game states. Public events must
never expose stock identities, unrevealed pozzetto contents, rejected candidates,
or other hidden strategy information.

## Match lifecycle

`GameState` remains the complete state of exactly one smazzata. The match layer owns
the current round number, current `GameState`, chronological settled-result history,
and the terminal state of the fixed four-smazzate match.

Completed rounds are settled exactly once through `calculateRoundScore`. Cumulative
team totals are derived from the immutable score snapshots in match history rather
than stored as a second mutable total. Match Points, the leading team or exact tie,
and the four-smazzate Victory Points allocation are also pure derived domain values.

Only the match layer may advance to a fresh `GameState`, and round four is terminal.
React may render match state and invoke match operations, but it must not implement
settlement, cumulative scoring, VP thresholds, or lifecycle decisions itself.

## UI

React components are not an alternative game engine.

UI responsibilities are limited primarily to:

- rendering game state;
- collecting player intent;
- invoking engine operations;
- displaying valid errors and resulting state transitions.

Domain decisions belong under `src/game`.

## Source-of-truth relationship

`docs/RULES.md` is authoritative for implemented Burraco behaviour.

This document describes technical architecture and invariants.

Milestone specifications define the scope and acceptance criteria for individual changes.

If rules, architecture, tests, and implementation materially conflict, report the conflict instead of silently resolving it.
