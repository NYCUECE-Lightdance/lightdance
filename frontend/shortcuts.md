# Keyboard Shortcuts

This document lists the available keyboard shortcuts for the Light Dance application.

## Playback and Navigation

-   **Space**: Play or Pause the audio.
-   **Right Arrow**: Seek forward by 50ms.
-   **Left Arrow**: Seek backward by 50ms.
-   **Shift + Right Arrow**: Jump to the next time point on the selected track.
-   **Shift + Left Arrow**: Jump to the previous time point on the selected track.
-   **A / W / S / D**: Move selection (Left, Up, Down, Right) across blocks and tracks.

## Timeline Editing

-   **Delete / Backspace**: Delete selected block(s).
-   **C**: Cut the selected block at the current time (only when exactly one block is selected).
-   **L**: Toggle the "Linear" (gradient) property for the selected block(s). When enabled, the color of the block will transition smoothly to the next block.
-   **B**: Open the "Blink" effect menu for the selected block (only when exactly one block is selected).
-   **M**: Toggle **Move Mode**. While active, click a colored block to start tracking it, move the mouse left/right to reposition it, then click anywhere to commit the new position and exit Move Mode. Pressing M again also commits the current position and exits. The move icon button in the top-left corner also toggles Move Mode (highlights blue when active).
-   **P**: Open the color picker to change the color of the selected block(s).
-   **Ctrl + Z**: Undo the last action.
-   **Ctrl + Y**: Redo the undone action.

### Drag(commeted out now)
Click and hold a colored block, then drag left or right to reposition it along the timeline. Release the mouse button to commit the new position. The block moves as a whole unit (both its start and end times shift equally), and is constrained by the surrounding blocks.

### Stretch Mode (Resize)
First select a colored block (single click). Then hover near the **left or right edge** of the block — the cursor changes to a resize arrow (`↔`). Click and drag the edge to resize the block:

The minimum block duration is **`STRETCH_MIN_MS = 50 ms`** (defined in `Timeline.jsx`). The block cannot be shrunk below this limit.

## Color and Brightness

-   **1-8**: Apply the corresponding favorite color to the selected block(s).
-   **Ctrl + 1-9**: Set the brightness (alpha) of the selected block(s) from 10% to 90%.
-   **Ctrl + 0**: Set the brightness (alpha) of the selected block(s) to 100%.
-   **Shift + 1-8**: Insert a new block at the current time using the corresponding favorite color.

## Weapon / Accessory Editing (AccessoryPanel)

The **AccessoryPanel** sidebar (right side of the main page) allows editing weapon and accessory parts (acc0–acc7, partIndex 14–21) for dancers that have them configured.

### Selecting a Dancer
- **Click on a dancer (Armor SVG)**: Selects that dancer tag and loads their accessory configuration into the AccessoryPanel.

### Accessory Configuration per Dancer
| Dancer | Weapon | Editable Parts |
|--------|--------|---------------|
| 舞者 1 (armor 0) | 無 | — |
| 舞者 2 (armor 1) | 無 | — |
| 舞者 3 (armor 2) | 螢光繩 | 繩: acc0, acc1 |
| 舞者 4 (armor 3) | 刀 | 刀身: acc0–acc3, 握把: acc4–acc5, 刀柄: acc6–acc7 |
| 舞者 5 (armor 4) | 匕首 | 刀身: acc0–acc1, 握把: acc2–acc3, 刀柄: acc4 |
| 舞者 6 (armor 5) | 無 | — |
| 舞者 7 (armor 6) | 匕首 | 刀身: acc0–acc1, 握把: acc2–acc3, 刀柄: acc4 |

- **Sidebar header (▲/▼)**: Click to collapse or expand the AccessoryPanel.

## Copy and Paste

-   **Ctrl + C**: Copy the selected blocks/range.
-   **Ctrl + V**: Paste the copied blocks, aligning the first block to the start of the currently selected block.
-   **Ctrl + Shift + V**: Paste the copied blocks at their original timestamps.
-   **Shift + C**: Copy the **entire** timeline of the selected track.
-   **Shift + V**: Paste the **entire** timeline to the currently selected track (overwriting it).
-   **Escape**: Cancel Copying Mode / Clear selection.
