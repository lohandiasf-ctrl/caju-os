import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';

// Mesmo projeto Firebase da web (lib/firebase.ts) — a mesma conta entra nos dois.
const firebaseConfig = {
  apiKey: 'AIzaSyBOiiBRwuN8VKZ-l2MFqaqQJ8sOc8zAXP4',
  authDomain: 'caju-websys.firebaseapp.com',
  projectId: 'caju-websys',
  storageBucket: 'caju-websys.firebasestorage.app',
  messagingSenderId: '143351783305',
  appId: '1:143351783305:web:96490d6e9b36cc259c8b58',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// `getReactNativePersistence` só existe no bundle React Native do SDK, que o
// Metro resolve em runtime; os tipos publicados são os da web, daí o acesso
// dinâmico. Sem isso a sessão se perde a cada abertura do app.
const reactNativePersistence = (
  firebaseAuth as unknown as {
    getReactNativePersistence?: (storage: unknown) => Persistence;
  }
).getReactNativePersistence;

export const auth: Auth = reactNativePersistence
  ? initializeAuth(app, { persistence: reactNativePersistence(AsyncStorage) })
  : getAuth(app);
