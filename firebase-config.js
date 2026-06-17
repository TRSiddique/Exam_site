// firebase-config.js
//
// 1. Go to https://console.firebase.google.com → Create project (free).
// 2. Inside the project: Build > Firestore Database > Create database
//    → Start in "test mode" (or use the security rules in firestore.rules.txt
//      included in this folder, which is safer).
// 3. Go to Project settings (gear icon) > General > "Your apps" > Web app (</>)
//    → register an app, copy the config object it gives you, and paste the
//      values below.
// 4. Save this file and open index.html (or deploy the folder anywhere
//    static, e.g. Firebase Hosting, Netlify, GitHub Pages).

const firebaseConfig = {
  apiKey: "AIzaSyD-HdEwOtM9V8Xffg9efnlcLJ_9iQ-StBQ",
  authDomain: "my-exam-app-6c571.firebaseapp.com",
  projectId: "my-exam-app-6c571",
  storageBucket: "my-exam-app-6c571.firebasestorage.app",
  messagingSenderId: "589341879998",
  appId: "1:589341879998:web:d8d96da5ec418f0885f8ef"
};

// Do not edit below this line.
window.__FIREBASE_CONFIG__ = firebaseConfig;
