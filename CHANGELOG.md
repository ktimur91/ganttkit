# Changelog

What changed in each version of ganttkit: the `ganttkit` package on npm and the shadcn-vue components in the registry. The [release notes](https://github.com/ktimur91/ganttkit/releases) have longer explanations and examples.

To update the components after a release:

```bash
npx shadcn-vue@latest add @ganttkit/gantt --overwrite
```

## [0.3.1] - 2026-11-05

### Fixed

- Changing `v-model:zoom` from outside, for example from your own buttons or a select, no longer jumps to other dates. Every zoom change keeps the date in the middle of the view in place, like `setZoom` and Ctrl + wheel.

### Changed

- The default bar is a tint of its color with a border, and the done part is a stronger tint, instead of a solid block with a thin progress line. The color is the theme's `primary` or `item.color`, also for milestones and the link dots.
- The `bar` slot content sits in a flex row, so a name, a percentage and an avatar line up. A narrow bar's outside label keeps the same layout.
- The components ask for `ganttkit@^0.3.1`.

### Demo

- A dashboard example with phases, owners and statuses, built with the `row` and `bar` slots.
- A Code button on every example with its source, ready to copy.
- The resource view colors bookings by project.

## [0.3.0] - 2026-11-04

### Added

- Resource view: pass people (or machines, rooms) as `rows` and their bookings as `items` with a `rowId`. Overlapping bookings stack into lanes and the row grows to fit them (`stackOverlaps`).
- Overloads: where a row runs more at once than its capacity (`getRowCapacity`, 1 by default), the time is shaded red and the row gets a red dot. `gantt.overloads` gives the ranges.
- Moving bars to another row by dragging up or down or with Alt + Up/Down, limited by `canMoveToRow`. `item-change` carries the new `rowId`.
- Right-click menu with a searchable "Move to" list, free rows first and busy ones marked. The Menu key or Shift + F10 opens it, the `menu` slot takes your own actions.
- Auto-shift (`auto-shift`): when an edit breaks a link, the successors move forward just enough, down the whole chain, keeping their length in working days. The shift is previewed while dragging.
- `items-change` event with all changes of one edit, for a single undo step or save request. `item-change` has `source: 'edit' | 'auto-shift'`.
- Tooltip with dates, duration and progress on hover, and the new dates and target row while dragging. `tooltip` slot, `:tooltip="false"` turns it off.
- A button in the sidebar header collapses or expands all rows.
- Headless: `moveToRow`, `moveItemToRow`, `moveTargets`, `allExpanded`, `hasNestedRows`, and `assignLanes`, `overloadSpans`, `shiftSuccessors`, `describeSpan` as standalone helpers. Row state has `height`, `lanes` and `overloads`, bar state has `lane`.

### Changed

- Narrow bars put their label outside only when it fits before the next bar.
- Bars that did not change are no longer re-rendered while scrolling.

## [0.2.0] - 2026-11-04

### Added

- Working calendars: `calendar` with working weekdays, holidays and working dates. Moving a task keeps its length in working days, a day off under the pointer snaps to the next working day, arrow keys step by working days, and days off are shaded.
- `createCalendar(rules, timeZone)` for the same rules in app code, e.g. `countWorkingDays(start, end)`.
- `useGanttHistory(items)` for undo and redo over immutable data: `commit`, `undo`, `redo`, `canUndo`, `canRedo`.
- Components: the grid shades days off from `nonWorkingDays`, the timescale dims their labels.

### Fixed

- The demo no longer shifts down when the fps counter appears after load.

## [0.1.1] - 2026-11-02

### Fixed

- The chart centers the initial date once it gets a size, so it also works when mounted hidden, for example in an inactive tab or a closed dialog. New `initialDate` option.

### Changed

- The first release published from GitHub Actions with npm provenance.

## [0.1.0] - 2026-11-02

First release: a Gantt chart for Vue 3 with a headless core and copy-in shadcn-vue components.

- `useGantt`: dates and time zones, layout, virtual scrolling, drag and drop, dependencies and zoom.
- Components: sidebar with nested rows, timescale, bars, milestones, summary bars, dependency arrows and a today line.
- Drag to move, drag the edges to resize, arrow keys to nudge.
- FS, SS, FF and SF links, created by dragging from a bar's dot. Cycles and duplicates are rejected, broken links are highlighted.
- Zoom from hours to quarters, Ctrl/Cmd + wheel zooms around the pointer.
- Edits come back in your date format.
- Light and dark theme through the shadcn-vue CSS variables.

[0.3.1]: https://github.com/ktimur91/ganttkit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ktimur91/ganttkit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ktimur91/ganttkit/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/ktimur91/ganttkit/releases/tag/v0.1.1
[0.1.0]: https://www.npmjs.com/package/ganttkit/v/0.1.0
