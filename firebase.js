// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyChDw575RfnFUqD3ec4gjipX3IlvCtuwOM",
  authDomain: "variete-3464e.firebaseapp.com",
  projectId: "variete-3464e",
  storageBucket: "variete-3464e.firebasestorage.app",
  messagingSenderId: "553943071734",
  appId: "1:553943071734:web:16a25d83a4bf378e11e5d7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);