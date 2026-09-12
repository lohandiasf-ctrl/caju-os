import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/context';
import { Loading } from '../src/ui/kit';
import { theme } from '../src/theme';

function Gate() {
  const { user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return;
    const inApp = segments[0] === '(app)';
    if (!user && inApp) router.replace('/login');
    if (user && !inApp) router.replace('/(app)');
  }, [user, segments, router]);

  if (user === undefined) return <Loading label="Verificando sessão…" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.background },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
