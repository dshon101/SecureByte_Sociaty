# 🛡️ SecureByte Society (SBS) — CTF Platform

A professional, fully-featured Capture The Flag competition platform for cybersecurity clubs and classrooms.
No server, no database — runs entirely in the browser from a single folder.

---

## 📁 Project Structure

```
sbs-ctf/
│
├── index.html          ← Main page (start here)
│
├── css/
│   └── main.css        ← All styles — edit to change colours, fonts, layout
│
├── js/
│   ├── app.js          ← All application logic — auth, challenges, leaderboard, terminal
│   └── files.js        ← Auto-generated: embedded challenge file downloads (base64)
│
├── challenges.json     ← ⭐ ADD / EDIT CHALLENGES HERE — no coding needed
│
└── assets/
    └── files/          ← Put challenge files here (referenced by challenges.json)
        ├── challenge1.txt
        ├── image.jpg
        ├── photo.jpg
        ├── mystery.bin
        ├── zzz.html
        └── zzzzchallenge.html
```

---

## 🚀 Hosting on GitHub Pages

### Step 1 — Create a repository
1. Go to https://github.com → click **"+"** → **New repository**
2. Name it: `sbs-ctf`
3. Set it to **Public** → click **Create repository**

### Step 2 — Upload ALL files keeping the folder structure
1. Click **Add file → Upload files**
2. Upload the entire project — you MUST keep the folder structure:
   - `index.html` at root
   - `css/main.css`
   - `js/app.js` and `js/files.js`
   - `challenges.json` at root
3. Click **Commit changes**

### Step 3 — Enable GitHub Pages
1. Go to **Settings → Pages**
2. Source: **Deploy from a branch** → branch: **main** → folder: **/ (root)**
3. Click **Save**

### Step 4 — Your site is live!
```
https://YOUR-USERNAME.github.io/sbs-ctf/
```

---

## ⚙️ Configuration

### Change the instructor key
Open `challenges.json` and find:
```json
"instructor_key": "sbs_admin_2025"
```
Change this to your own secret before sharing the URL with students.

### Change the platform name
Open `challenges.json` and edit the `competition` block:
```json
"competition": {
  "name":       "SecureByte Society",
  "short":      "SBS",
  "tagline":    "Capture The Flag Competition",
  "edition":    "2025 Edition",
  "instructor_key": "sbs_admin_2025",
  "welcome_message": "..."
}
```

---

## 🎯 Adding Challenges

### Option A — Edit challenges.json directly (recommended)
Add a new object to the `"challenges"` array:

```json
{
  "id":          "c7",
  "title":       "My New Challenge",
  "category":    "crypto",
  "icon":        "🔐",
  "difficulty":  "medium",
  "points":      200,
  "author":      "Your Name",
  "description": "A description of what students need to do.",
  "file":        "newfile.txt",
  "image":       null,
  "tools":       ["tool1", "tool2"],
  "steps": [
    "Step 1: Do this",
    "Step 2: Then this"
  ],
  "hints": [
    "Gentle hint",
    "More specific hint",
    "Almost the answer"
  ],
  "flag":    "flag{your_secret_flag}",
  "visible": true
}
```

**Field reference:**

| Field        | Required | Description |
|---|---|---|
| `id`         | ✅ | Unique ID string — no spaces |
| `title`      | ✅ | Challenge name |
| `category`   | ✅ | `crypto`, `forensics`, `web`, `binary`, `misc`, `pwn` |
| `difficulty` | ✅ | `easy`, `medium`, `hard` |
| `points`     | ✅ | Score value (e.g. 100, 200, 300) |
| `flag`       | ✅ | Must start with `flag{` or `FLAG{` |
| `description`| ✅ | What students need to do |
| `icon`       | — | Emoji icon for the card |
| `author`     | — | Your name or team |
| `file`       | — | Filename students will download |
| `image`      | — | URL to a preview image (can be `null`) |
| `tools`      | — | Array of tool names |
| `steps`      | — | Array of step-by-step instructions |
| `hints`      | — | Array of up to 3 hints (each costs −10 pts) |
| `visible`    | — | `true` or `false` to show/hide |

### Option B — Use the Admin panel in-browser
Log in as Instructor → **Admin tab** → fill in the Add Challenge form → click **Add**.
Note: Admin-added challenges are stored in the browser and reset if localStorage is cleared.
For permanent challenges, add them to `challenges.json`.

### Adding a preview image
Set the `"image"` field to any public image URL:
```json
"image": "https://i.imgur.com/yourimage.png"
```
Or host an image in your GitHub repo and reference it:
```json
"image": "assets/images/challenge7.png"
```
If `image` is `null`, the platform shows an animated terminal preview.

---

## 🔧 Adding Challenge File Downloads

When you want students to download a file for a challenge, there are two approaches:

### For permanent files (recommended)
1. Edit `js/files.js` — add an entry:
```js
"mynewfile.txt": { b64: "BASE64_ENCODED_CONTENT", mime: "text/plain" }
```
To convert a file to base64:
- **Linux/Mac**: `base64 -w0 yourfile.txt`
- **Windows**: `certutil -encode yourfile.txt output.b64`
- **Online**: https://www.base64encode.org/

### For dynamic files
Use the Admin panel → the download button will appear automatically if the filename matches an entry in `files.js`.

---

## 🎨 Customising the Design

Open `css/main.css` and find the `:root` block at the top:

```css
:root {
  --green:  #00ff88;   /* primary accent */
  --cyan:   #00d4ff;   /* secondary accent */
  --amber:  #ffaa00;   /* points / scores */
  --red:    #ff4455;   /* errors / hard difficulty */
  --purple: #aa44ff;   /* crypto category */
  ...
}
```
Change these hex values to retheme the entire platform instantly.

---

## 🔑 Accounts & Roles

| Role       | How to register | Access |
|---|---|---|
| Student    | Register normally | Challenges, Leaderboard, Terminal |
| Instructor | Register with the instructor key | All above + Admin panel |

**Default instructor key:** `sbs_admin_2025` — change this in `challenges.json` before deployment.

---

## 💾 Data Storage

All data is stored in each user's browser `localStorage`. This means:
- ✅ No server or database needed
- ✅ Works offline
- ✅ Students keep their progress between sessions
- ⚠️ Each student's data is on their own device only
- ⚠️ Clearing browser data resets progress

---

## 🏆 Scoring

| Action | Points |
|---|---|
| Solve a challenge | +full challenge points |
| Use a hint | −10 pts per hint revealed |
| Hints per challenge | Maximum 3 |

---

## 📖 Default Challenges

| # | Title | Category | Points | Difficulty | Real Flag |
|---|---|---|---|---|---|
| 1 | Decode the Message | Crypto | 100 | Easy | `flag{base64_is_fun}` |
| 2 | Fake Image | Forensics | 150 | Easy | `flag{hidden_in_zip}` |
| 3 | Metadata Hunt | Forensics | 200 | Medium | `flag{metadata_leak}` |
| 4 | Hidden Strings | Binary | 200 | Medium | `flag{strings_found}` |
| 5 | Client-Side Secrets | Web | 100 | Easy | `FLAG{cl13nt_s1d3_1s_n3v3r_s3cur3}` |
| 6 | Encoded Login | Web | 250 | Medium | `FLAG{l0g1n_cr4ck3d}` |

---

*SecureByte Society CTF Platform — built for education and ethical hacking practice.*
*Always hack responsibly, legally, and with permission.*
