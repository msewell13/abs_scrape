# Copying Files to Windows

The Grist integration files are ready in `/tmp/abs_scrape_temp` on your Linux server.

## Option 1: Pull from Temp Repo (Recommended)

On your Windows machine, in `C:\Users\msewe\Desktop\abs_scrape`:

```bash
# Add the temp repo as a remote
git remote add temp-server file:///tmp/abs_scrape_temp

# Or if you have SSH access, use:
git remote add temp-server matt@your-server:/tmp/abs_scrape_temp

# Fetch and merge
git fetch temp-server
git merge temp-server/main --allow-unrelated-histories

# Or cherry-pick the commit
git cherry-pick 8c86556
```

## Option 2: Manual Copy via SCP/SFTP

Use an SCP/SFTP client (WinSCP, FileZilla, or `scp` command) to copy these files:

From server: `/tmp/abs_scrape_temp/`
To Windows: `C:\Users\msewe\Desktop\abs_scrape\`

Files to copy:
- `grist_client.py`
- `grist_integration.py`
- `requirements.txt`
- `GRIST_INTEGRATION.md`
- `scripts/run_with_grist.sh` (create `scripts` folder first)

## Option 3: Git Pull from GitHub (After pushing)

If you push the temp repo to GitHub first, then on Windows:

```bash
cd C:\Users\msewe\Desktop\abs_scrape
git pull origin main
```

## Option 4: Create a Patch File

I can create a patch file that you can apply on Windows.

