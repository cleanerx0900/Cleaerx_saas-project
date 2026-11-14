# CleanerX — Restore Guide

## Prerequisites
- Node.js 18+
- A Supabase project (free tier works)

## Steps

1. **Extract the backup**
   ```
   unzip CleanerX_Backup_v001.zip -d cleanerx
   cd cleanerx
   ```

2. **Install dependencies**
   ```
   npm install
   ```

3. **Set environment variables**
   Copy `.env.example` to `.env.local` and fill in your values:
   ```
   cp .env.example .env.local
   ```

4. **Apply database migrations** (in order)
   Run each file in `sql/migrations/` against your Supabase project via the SQL editor.

5. **Start the app**
   ```
   npm run dev
   ```
   App runs at http://localhost:5000

## Backup location
Latest: `/backups/CleanerX_Backup_v010.zip`
