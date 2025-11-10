<p align="center">
  <a href="https://ritiksw.github.io/Solo-Leveling/">
    <img width="691" height="748" alt="Solo Gym Leveling UI" src="https://github.com/user-attachments/assets/efa65860-41a8-488b-8a99-f43076220d61" />
  </a>
</p>
<p align="center">
  <a href="https://ritiksw.github.io/Solo-Leveling/">
    <img width="694" height="308" alt="Solo Gym Leveling Quest Panel" src="https://github.com/user-attachments/assets/f1bb9147-4704-4041-859e-343f3a62e179" />
  </a>
</p>

<p align="center">
  <a href="https://ritiksw.github.io/Solo-Leveling/">
    <img src="https://img.shields.io/badge/Solo%20Gym%20Leveling-Live%20Demo-1f6feb?style=for-the-badge" alt="Live Demo">
  </a>
</p>

# Solo Gym Leveling — Firebase Setup Guide

This project is a futuristic Solo Leveling–inspired training HUD built with HTML/CSS/JS and optional Firebase Cloud Sync. Follow these steps to wire it up.

## 1. Create the Firebase Project
- Visit [console.firebase.google.com](https://console.firebase.google.com) and sign in with a Google account.
- Click **Add project**, choose a name (for example, `solo-gym-leveling`), and finish the wizard.
- Leave Google Analytics disabled unless you specifically need it (you can enable it later).

## 2. Register the Web App
- In the Firebase console, open **Project settings** (gear icon near “Project Overview”).
- Under **Your apps**, pick the `</>` icon to register a web app.
- Give it an app nickname and keep “Also set up Firebase Hosting” unchecked if you just need local testing.
- Firebase shows a config snippet. Copy the values (`apiKey`, `authDomain`, `projectId`, etc.) into `firebase-config.js`, replacing the placeholder strings. If Analytics is off, there will be no `measurementId`—omit that line.

```javascript
// firebase-config.js (example)
export const firebaseConfig = {
  apiKey: 'YOUR_REAL_API_KEY',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123def456'
};
```

## 3. Enable Cloud Firestore
- In the left sidebar choose **Firestore Database** → **Create database**.
- Select **Production** (secure) or **Test** mode (open, auto-locks after 30 days) and pick a region close to you.
- After provisioning, adjust rules if needed. For quick local demos you can use the rule below (remember to tighten before publishing).

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /soloGymPlayers/{playerId} {
      allow read, write;
    }
  }
}
```

Publish the rules when prompted.

## 4. Verify Rules & Indexes
- In the Firestore **Rules** tab confirm the active rules were published.
- You do not need any composite indexes yet. If Firebase later suggests one in the console, add it from the **Indexes** tab.

## 5. Configure Local Development
- Serve the project with a local web server so ES module imports and Firebase CDN scripts load correctly:
  - `npx serve` or a similar static server, **or**
  - `npm create vite@latest` and drop the files into the generated project.
- Open the served URL. With valid Firebase credentials you should see logs such as “Firebase link established. Progress synchronized.” in the browser console.

## 6. (Optional) Local Emulators
- Install the Firebase CLI if you want to test without touching the cloud:
  ```bash
  npm install -g firebase-tools
  firebase login
  firebase init emulators
  firebase emulators:start
  ```
- When running emulators, update the app to point to them, for example:

```javascript
import { connectFirestoreEmulator } from 'firebase/firestore';
// ...
if (import.meta.env?.DEV) {
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

## 7. Deploy (Optional)
- If you want Firebase Hosting, run `firebase init hosting` and follow the prompts for the project.
- Deploy with `firebase deploy` once you are ready to share a hosted build.

## 8. Confirm Sync
- Refresh the app after updating `firebase-config.js`.
- It should auto-create a document under `soloGymPlayers/{playerId}` and start syncing stats, skills, and mission targets.
- If you see errors in the console, double-check credentials, Firestore rules, or network access.

---

Need help? Open an issue or drop a note, and we can troubleshoot together. Happy leveling!

