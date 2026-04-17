import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyCLq_BgWkvU9imcp55oTXwOMEHHf6DuXAY",
  authDomain: "kindcuisine.firebaseapp.com",
  projectId: "kindcuisine",
  storageBucket: "kindcuisine.firebasestorage.app",
  messagingSenderId: "480409399007",
  appId: "1:480409399007:web:fe94ed964ecc314968436a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);