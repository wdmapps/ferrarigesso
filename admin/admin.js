import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig, SITE_ID } from '../firebase-config.js';
import { DEFAULT_DATA } from '../site-data.js';

window.__FGFB = { initializeApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, getFirestore, doc, getDoc, setDoc, serverTimestamp, firebaseConfig, SITE_ID, DEFAULT_DATA };
for (const src of ['./app-1.js','./app-2.js','./app-3.js','./app-4a.js','./app-4b.js','./app-5.js']) {
  await new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; s.async=false; s.onload=resolve; s.onerror=reject; document.body.appendChild(s); });
}
