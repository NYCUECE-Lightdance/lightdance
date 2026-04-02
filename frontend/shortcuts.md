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
-   **B**: Open a prompt to enter the "Blink" (strobe) interval in milliseconds (only when exactly one block is selected). The interval must be a multiple of 50.
-   **M**: Open the color picker to change the color of the selected block(s).
-   **Ctrl + Z**: Undo the last action.
-   **Ctrl + Y**: Redo the undone action.

## Color and Brightness

-   **1-8**: Apply the corresponding favorite color to the selected block(s).
-   **Ctrl + 1-9**: Set the brightness (alpha) of the selected block(s) from 10% to 90%.
-   **Ctrl + 0**: Set the brightness (alpha) of the selected block(s) to 100%.
-   **Shift + 1-8**: Insert a new block at the current time using the corresponding favorite color.

## Copy and Paste

-   **Ctrl + C**: Copy the selected blocks/range.
-   **Ctrl + V**: Paste the copied blocks, aligning the first block to the start of the currently selected block.
-   **Ctrl + Shift + V**: Paste the copied blocks at their original timestamps.
-   **Shift + C**: Copy the **entire** timeline of the selected track.
-   **Shift + V**: Paste the **entire** timeline to the currently selected track (overwriting it).
-   **Escape**: Cancel Copying Mode / Clear selection.

## Selection & Multi-select

-   **Click**: Select a single block. 
    * If in **Copying Mode**, the clicked block becomes the **Paste Target** (highlighted with a **Green border**).
    * Clicking a **Black block** (transition) will clear all current selections.
-   **Shift + Click**: Select a range of blocks between the first selected block (anchor) and the clicked block.
    * **Smart Filter**: Black transition blocks ($R=0, G=0, B=0$) within the range are automatically excluded from the selection to prevent accidental color overrides.
-   **Click Empty Area**: Click any area outside the timeline blocks, palette, or controls to clear all selections and deactivate "Color Change" mode.

## Visual Indicators

| Border Color | Meaning |
| :--- | :--- |
| **Orange** | Normal selection or Copy Source (the block you just pressed Ctrl+C on). |
| **Green** | Paste Target (the destination block when `isCopying` is active). |
| **Cyan** | Selected block that is already close to Orange (auto-adjusted for visibility). |
| **Wand Icon** | Indicates the block has the `Linear` (gradient) property enabled. |