import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../src/auth/context';
import { canAccess } from '../../src/domain/permissions';
import { ErrorState, Loading } from '../../src/ui/kit';
import { theme } from '../../src/theme';

export default function AppLayout() {
  const { profile, profileError, logout } = useAuth();

  if (profileError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background }}>
        <ErrorState message={profileError} onRetry={logout} />
        <Text
          style={{
            color: theme.color.textMuted,
            textAlign: 'center',
            paddingBottom: theme.space(10),
            fontSize: theme.font.size.sm,
          }}
        >
          Sair e entrar com outra conta
        </Text>
      </View>
    );
  }

  if (!profile) return <Loading label="Carregando seu perfil…" />;

  const role = profile.role;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Operação',
          tabBarIcon: ({ color, size }) => <Ionicons name="layers-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="central-n1"
        options={{
          title: 'Central N1',
          href: canAccess(role, 'central-n1') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="headset-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="spares"
        options={{
          title: 'Spares',
          href: canAccess(role, 'spares') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="financeiro"
        options={{
          title: 'Financeiro',
          href: canAccess(role, 'financeiro') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa',
          href: canAccess(role, 'mapa') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="chamado/[key]" options={{ href: null }} />
    </Tabs>
  );
}
