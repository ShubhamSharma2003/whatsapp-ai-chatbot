# Campaign Recipients: Filter Chips + Go to Chat

**Date:** 2026-04-25
**Status:** Approved

## Problem

The campaign report page lists all recipients in one unsorted table. Users cannot quickly find who replied vs who didn't. Searching for a recipient in the chat section requires manually copying the phone number and pasting it into the search bar — there's no direct link from the campaign history to the conversation.

## Solution

Two additions to the Report tab in `campaigns/page.tsx`:

1. **Multi-select filter chips** above the recipients table
2. **"Go to Chat" button** on each recipient row

No new API endpoints. No backend changes.

---

## Feature 1: Filter Chips

### Placement
Above the recipients table, below the performance rates section.

### Chips
`All · Sent · Delivered · Read · Replied · Failed`

### Behavior
- Default: "All" selected, full table shown
- Selecting a specific status chip deselects "All" and filters table to matching rows
- Multiple chips can be active simultaneously (e.g. Delivered + Read both active = show rows with either status)
- Re-selecting "All" clears all specific filters
- Filtering is client-side, instant, no API call

### Visual Style
- Chips use the same status colors already in the table badges:
  - Sent: blue
  - Delivered: green
  - Read: purple
  - Replied: yellow/amber
  - Failed: red
- Active chip: colored background + border
- Inactive chip: ghost/outline style
- "All" chip: neutral color

---

## Feature 2: Go to Chat Button

### Placement
Rightmost column of the recipients table, every row.

### Behavior
- Clicking navigates (same tab) to `/?phone=<phone_number>`
- Main page (`page.tsx`) reads `?phone=` query param on load
- Pre-fills `searchQuery` state with the phone value
- Conversation list filters instantly to matching contact
- If exactly one conversation matches, auto-select it
- After auto-selecting, remove `?phone=` from URL via `history.replaceState` (prevents re-trigger on refresh)
- If no conversation matches, search stays populated showing empty state — user can start a new chat manually

### Visual Style
- Small ghost button with a message/chat icon
- Label: "Chat" or icon-only with tooltip "Go to Chat"
- Present on every row regardless of recipient status

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/campaigns/page.tsx` | Add filter chips state + logic, add "Go to Chat" column to recipients table |
| `src/app/page.tsx` | Read `?phone=` param on mount, set searchQuery, auto-select conversation, clear param |

---

## Data Notes

- Phone format is identical in both tables (`campaign_recipients.phone` and `conversations.phone`): raw string e.g. `919810001234`
- No transformation needed between campaign phone and chat search query
- The existing `filteredConversations` filter in `page.tsx` already matches on `c.phone.toLowerCase().includes(q)` — the URL param plugs straight in

---

## Out of Scope

- Creating a new conversation if none exists (user handles manually)
- Sorting the recipients table
- Pagination changes
- Any backend / API changes
