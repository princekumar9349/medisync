# Medisync Mobile — React Native (Expo)

## 🚀 Getting Started

### 1. Set your backend IP
Open `src/services/api.js` and update `API_BASE`:

// Deployed Backend:
export const API_BASE = 'https://medisync-backend-520988526649.asia-south1.run.app';

### 2. Install dependencies (already done)
```bash
cd mobile/
npm install --legacy-peer-deps
```

### 3. Start the Expo dev server
```bash
npx expo start
```

Then:
- Press **`a`** to open on Android Emulator
- Scan the QR code with **Expo Go** app on your phone
- Press **`i`** for iOS Simulator (Mac only)

---

## 📁 Folder Structure

```
mobile/
├── App.js                    ← Root entry point
├── app.json                  ← Expo config (permissions, icon, etc.)
├── babel.config.js
├── package.json
├── assets/                   ← App icons + splash
│   ├── icon.png
│   ├── splash.png
│   └── adaptive-icon.png
└── src/
    ├── theme.js              ← Design system (colors, fonts, spacing)
    ├── context/
    │   └── AuthContext.js    ← JWT auth with AsyncStorage
    ├── services/
    │   └── api.js            ← All API calls to FastAPI backend
    ├── navigation/
    │   └── AppNavigator.js   ← Auth gate + tab navigators
    └── screens/
        ├── LoginScreen.js
        ├── RegisterScreen.js
        ├── patient/
        │   ├── ScanScreen.js      ← Camera/gallery + /scan API
        │   ├── ResultsScreen.js   ← Scan results display
        │   ├── PillboxScreen.js   ← Morning/Afternoon/Night tracking
        │   ├── ChatScreen.js      ← AI + Doctor chat
        │   ├── HistoryScreen.js   ← Prescriptions + adherence ring
        │   └── ProfileScreen.js   ← Settings, voice, logout
        └── doctor/
            ├── DoctorInboxScreen.js    ← Patient message thread
            ├── DoctorPatientsScreen.js ← Patient list + notes
            └── DoctorAlertsScreen.js   ← Alert sender
```

---

## 🔧 Troubleshooting

### Metro bundler fails to start
```bash
npx expo start --clear
```

### `Cannot find module` errors
```bash
rm -rf node_modules && npm install --legacy-peer-deps
```

### API connection refused on device
- Make sure your device has internet access to reach the deployed backend.

### Android emulator API issues
- Ensure the backend is reachable: `https://medisync-backend-520988526649.asia-south1.run.app`

---

## 🎙️ Voice Features

- **Text-to-Speech**: Uses `expo-speech` — works on both Android and iOS
- **Toggle**: Enable in Profile tab → Voice Output switch
- **Languages**: English (en-IN) and Hindi (hi-IN)
- **Triggers**: Scan results, Pillbox "Mark Taken", AI chat responses

---

## 🌐 API Endpoints Used

| Endpoint | Screen |
|----------|--------|
| `POST /auth/login` | Login |
| `POST /auth/register` | Register |
| `GET /me` | Auth context |
| `POST /scan` | Scan screen |
| `GET /user-prescriptions` | Pillbox, History |
| `POST /mark-done` | Pillbox |
| `GET /insights` | History |
| `POST /chat` | AI chat |
| `POST /doctor/message` | Doctor chat, Alerts |
| `GET /doctor/messages` | Inbox |
| `DELETE /expired` | History |

---

## 📱 Tested On
- Android Emulator (API 33+)
- Expo Go (Android)

## 🔑 Role-Based Access
- **Patient** → 6-tab shell (Scan, Results, Pillbox, Chat, History, Profile)
- **Doctor** → 3-tab shell (Inbox, Patients, Alerts)

Role is selected on the Login screen and stored in AsyncStorage.
