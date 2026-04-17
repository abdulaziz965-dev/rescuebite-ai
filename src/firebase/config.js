import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCLq_BgWkvU9imcp55oTXwOMEHHf6DuXAY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kindcuisine.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kindcuisine",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kindcuisine.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "480409399007",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:480409399007:web:fe94ed964ecc314968436a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);