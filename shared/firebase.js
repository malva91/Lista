import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_6uLUWKa8ag52VBQ0R1tGA1J_yii0Mrg",
  authDomain: "chiosco-6e4e1.firebaseapp.com",
  projectId: "chiosco-6e4e1",
  storageBucket: "chiosco-6e4e1.firebasestorage.app",
  messagingSenderId: "623725971757",
  appId: "1:623725971757:web:ff663aa3d278d52359aba4",
  measurementId: "G-CC45E9DWR7"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);