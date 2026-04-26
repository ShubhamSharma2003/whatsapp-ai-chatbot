# Campaign Recipients Filter + Go to Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select status filter chips and a "Go to Chat" button to the campaign report recipients table, and handle `?phone=` navigation on the main chat page.

**Architecture:** All changes are client-side only. Two files modified: `campaigns/page.tsx` gets filter chip state + UI + "Go to Chat" column; `page.tsx` (main chat) reads `?phone=` on mount, sets search query, auto-selects matching conversation, then clears the param.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src/app/campaigns/page.tsx` | Add `statusFilter` state, filter chips UI above recipients table, "Go to Chat" column on each row |
| `src/app/page.tsx` | On mount read `?phone=` URL param, set `searchQuery`, auto-select first matching conversation, clear param |

---

### Task 1: Add status filter state to campaigns/page.tsx

**Files:**
- Modify: `src/app/campaigns/page.tsx`

- [ ] **Step 1: Add `statusFilter` state**

Find the block of `useState` declarations around line 85 in `src/app/campaigns/page.tsx` (near `const [report, setReport] = useState<CampaignReport | null>(null)`). Add this line immediately after it:

```tsx
const [statusFilter, setStatusFilter] = useState<string[]>([]);
```

`statusFilter` is an array of active status strings. Empty array = "All" (show everything).

- [ ] **Step 2: Add `filteredRecipients` derived value**

Find the line `export default function CampaignsPage() {` and locate the area after the state declarations (around line 105, before the first `async function`). Add this derived value:

```tsx
const filteredRecipients = report?.recipients.filter((r) => {
  if (statusFilter.length === 0) return true;
  return statusFilter.includes(r.status);
}) ?? [];
```

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/page.tsx
git commit -m "feat: add statusFilter state and filteredRecipients derived value"
```

---

### Task 2: Add filter chips UI above recipients table

**Files:**
- Modify: `src/app/campaigns/page.tsx`

- [ ] **Step 1: Locate the recipients table header**

Find this block around line 882:
```tsx
{/* Recipients Table */}
<div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
  <div className="px-5 py-3 border-b border-white/[0.06]">
    <h4 className="text-xs font-medium text-white/50 uppercase tracking-wider">Recipients Detail</h4>
  </div>
```

- [ ] **Step 2: Replace the recipients table header div with header + filter chips**

Replace:
```tsx
{/* Recipients Table */}
<div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
  <div className="px-5 py-3 border-b border-white/[0.06]">
    <h4 className="text-xs font-medium text-white/50 uppercase tracking-wider">Recipients Detail</h4>
  </div>
```

With:
```tsx
{/* Recipients Table */}
<div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
  <div className="px-5 py-3 border-b border-white/[0.06] flex flex-wrap items-center gap-2">
    <h4 className="text-xs font-medium text-white/50 uppercase tracking-wider mr-2">Recipients Detail</h4>
    {[
      { label: "All", value: "", color: "text-white/60 border-white/20 bg-white/5 data-[active=true]:bg-white/15 data-[active=true]:border-white/40 data-[active=true]:text-white" },
      { label: "Sent", value: "sent", color: "text-blue-400 border-blue-400/20 bg-blue-400/5 data-[active=true]:bg-blue-400/20 data-[active=true]:border-blue-400/50" },
      { label: "Delivered", value: "delivered", color: "text-emerald-400 border-emerald-400/20 bg-emerald-400/5 data-[active=true]:bg-emerald-400/20 data-[active=true]:border-emerald-400/50" },
      { label: "Read", value: "purple", color: "text-purple-400 border-purple-400/20 bg-purple-400/5 data-[active=true]:bg-purple-400/20 data-[active=true]:border-purple-400/50" },
      { label: "Replied", value: "replied", color: "text-amber-400 border-amber-400/20 bg-amber-400/5 data-[active=true]:bg-amber-400/20 data-[active=true]:border-amber-400/50" },
      { label: "Failed", value: "failed", color: "text-red-400 border-red-400/20 bg-red-400/5 data-[active=true]:bg-red-400/20 data-[active=true]:border-red-400/50" },
    ].map((chip) => {
      const isAll = chip.value === "";
      const isActive = isAll ? statusFilter.length === 0 : statusFilter.includes(chip.value);
      return (
        <button
          key={chip.label}
          data-active={isActive}
          onClick={() => {
            if (isAll) {
              setStatusFilter([]);
            } else {
              setStatusFilter((prev) =>
                prev.includes(chip.value)
                  ? prev.filter((s) => s !== chip.value)
                  : [...prev, chip.value]
              );
            }
          }}
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border transition-all ${chip.color}`}
        >
          {chip.label}
        </button>
      );
    })}
  </div>
```

- [ ] **Step 3: Fix the "Read" chip value** — the chip above has `value: "purple"` which is wrong. Fix it to `value: "read"`:

Find:
```tsx
{ label: "Read", value: "purple", color: "text-purple-400 border-purple-400/20 bg-purple-400/5 data-[active=true]:bg-purple-400/20 data-[active=true]:border-purple-400/50" },
```
Replace with:
```tsx
{ label: "Read", value: "read", color: "text-purple-400 border-purple-400/20 bg-purple-400/5 data-[active=true]:bg-purple-400/20 data-[active=true]:border-purple-400/50" },
```

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/page.tsx
git commit -m "feat: add multi-select status filter chips to recipients table"
```

---

### Task 3: Wire filteredRecipients into the table + add Go to Chat column

**Files:**
- Modify: `src/app/campaigns/page.tsx`

- [ ] **Step 1: Add "Actions" column header**

Find the `<thead>` section around line 889:
```tsx
<th className="text-left px-4 py-2.5 text-white/40 font-medium hidden lg:table-cell">Error</th>
```
Replace with:
```tsx
<th className="text-left px-4 py-2.5 text-white/40 font-medium hidden lg:table-cell">Error</th>
<th className="text-left px-4 py-2.5 text-white/40 font-medium">Chat</th>
```

- [ ] **Step 2: Replace `report.recipients.map` with `filteredRecipients.map` and add Go to Chat cell**

Find:
```tsx
{report.recipients.map((r, i) => (
  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
    <td className="px-4 py-2.5 text-white/70 font-mono">{r.phone}</td>
```
Replace with:
```tsx
{filteredRecipients.map((r, i) => (
  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
    <td className="px-4 py-2.5 text-white/70 font-mono">{r.phone}</td>
```

- [ ] **Step 3: Add "Go to Chat" cell at end of each row**

Find the closing error cell in each row:
```tsx
<td className="px-4 py-2.5 text-red-400/70 hidden lg:table-cell max-w-[200px] truncate">{r.error || "—"}</td>
            </tr>
```
Replace with:
```tsx
<td className="px-4 py-2.5 text-red-400/70 hidden lg:table-cell max-w-[200px] truncate">{r.error || "—"}</td>
<td className="px-4 py-2.5">
  <Link
    href={`/?phone=${r.phone}`}
    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    Chat
  </Link>
</td>
            </tr>
```

- [ ] **Step 4: Verify `Link` is already imported**

Check line 3 of `campaigns/page.tsx` — it should read:
```tsx
import Link from "next/link";
```
If it's missing, add it after the first import line.

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/page.tsx
git commit -m "feat: wire filteredRecipients and add Go to Chat column"
```

---

### Task 4: Handle ?phone= param on the main chat page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add phone param effect after fetchConversations effect**

Find this block around line 51:
```tsx
useEffect(() => {
  fetchConversations();
}, [fetchConversations]);
```

Add a new effect immediately after it:
```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const phone = params.get("phone");
  if (!phone) return;
  setSearchQuery(phone);
  window.history.replaceState({}, "", window.location.pathname);
}, []);
```

This runs once on mount. It reads `?phone=`, pre-fills the search bar, then removes the param from the URL so refresh doesn't re-trigger it.

- [ ] **Step 2: Add auto-select effect that fires when conversations + searchQuery are both ready**

Add this effect after the one you just added:
```tsx
useEffect(() => {
  if (!searchQuery || conversations.length === 0) return;
  const q = searchQuery.trim().toLowerCase();
  const matches = conversations.filter(
    (c) =>
      c.phone.toLowerCase().includes(q) ||
      (c.name?.toLowerCase().includes(q) ?? false)
  );
  if (matches.length === 1) {
    setSelectedId(matches[0].id);
  }
}, [conversations, searchQuery]);
```

When exactly one conversation matches the search, auto-select it. If zero or multiple match, leave selection to the user.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: handle ?phone= param to pre-fill chat search and auto-select conversation"
```

---

## Self-Review

**Spec coverage:**
- ✅ Multi-select filter chips (All/Sent/Delivered/Read/Replied/Failed) — Task 1 + 2
- ✅ Multiple chips active simultaneously — Task 2 toggle logic
- ✅ "All" clears specific filters / specific chips deselect "All" — Task 2 onClick logic
- ✅ Go to Chat button on every row — Task 3
- ✅ Navigates same tab to `/?phone=<number>` — Task 3 Link href
- ✅ Main page pre-fills searchQuery from `?phone=` — Task 4 Step 1
- ✅ Auto-selects if exactly one match — Task 4 Step 2
- ✅ Clears `?phone=` from URL after reading — Task 4 Step 1 `replaceState`
- ✅ No backend changes — confirmed, both tasks are frontend only

**Placeholder scan:** No TBDs, no vague steps, all code is complete.

**Type consistency:** `statusFilter: string[]`, `filteredRecipients` uses `r.status: string` — matches `CampaignRecipient.status: string` defined at line 52 of campaigns/page.tsx. `setSelectedId` and `setSearchQuery` signatures match existing state in page.tsx.
