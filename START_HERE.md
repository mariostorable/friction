# 👋 START HERE - Quick Reference for Claude

**Last Updated**: February 11, 2026

---

## 📖 Read These Files First (Every Session)

### 1. CLAUDE.md (ALWAYS READ FIRST)
**Purpose**: Complete developer guide
**Contains**:
- Project overview (what this app does)
- Architecture (92 API routes, 43 components, 12+ tables)
- Database schema with relationships
- API patterns (auth, cron, sync workflows)
- Development conventions
- Key gotchas and common issues

**Read Time**: 15-20 minutes
**Update**: At end of session if architecture changes

### 2. TODO.md
**Purpose**: Current priorities and roadmap
**Contains**:
- Immediate actions (what to do today)
- High priority tasks (this week)
- Medium/long-term roadmap
- Known bugs
- Recent completions

**Read Time**: 5-10 minutes
**Update**: At end of session with new tasks

### 3. Latest Session Summary
**Location**: SESSION_SUMMARY_YYYY-MM-DD.md
**Purpose**: What happened in the last session
**Contains**:
- What we accomplished
- What we fixed
- What to do next

**Read Time**: 5 minutes
**Create New**: At end of each session

---

## 🚀 Quick Start Commands

### Start Dev Server
```bash
npm run dev
# Open http://localhost:3000
```

### Run Jira Sync
```bash
npx tsx scripts/direct-jira-sync.ts
```

### Common Diagnostic Scripts
```bash
npx tsx scripts/test-client-field-linking.ts
npx tsx scripts/count-west-coast-tickets.ts
npx tsx scripts/check-client-field-12184.ts
```

---

## 🎯 Current Priorities (As of Feb 11, 2026)

1. **Verify Dashboard** - Check West Coast account shows 10-11 Jira tickets
2. **Investigate Missing Accounts** - Why StorageMart (18 tickets) doesn't match
3. **Improve Matching Logic** - Reduce false positives

See TODO.md for full list.

---

**Ready to Start?** Read CLAUDE.md, then check TODO.md for current priorities!
