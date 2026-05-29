import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBwExHBtnZNCZIYDxlj0RdCosptq0iWicM",
  authDomain: "imv1-f5f64.firebaseapp.com",
  databaseURL: "https://imv1-f5f64-default-rtdb.firebaseio.com",
  projectId: "imv1-f5f64",
  storageBucket: "imv1-f5f64.firebasestorage.app",
  messagingSenderId: "1088344936506",
  appId: "1:1088344936506:web:60f49c5773681a4e7a2503",
  measurementId: "G-BYQWCJFC9J"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);