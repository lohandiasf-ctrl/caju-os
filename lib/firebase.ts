'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyBOiiBRwuN8VKZ-l2MFqaqQJ8sOc8zAXP4',
  authDomain: 'caju-websys.firebaseapp.com',
  projectId: 'caju-websys',
  storageBucket: 'caju-websys.firebasestorage.app',
  messagingSenderId: '143351783305',
  appId: '1:143351783305:web:96490d6e9b36cc259c8b58',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
