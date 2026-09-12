import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../src/auth/context';
import { roleLabels } from '../../src/domain/permissions';
import { auth } from '../../src/firebase';
import { API_BASE } from '../../src/api/client';
import { Card, Row } from '../../src/ui/kit';
import { theme } from '../../src/theme';

export default function PerfilScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user, logout } = useAuth();
  const [sending, setSending] = useState(false);

  async function changePassword() {
    if (!user?.email) return;
    setSending(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      Alert.alert(
        'E-mail enviado',
        'Se existir uma conta com este e-mail, as instruções de troca de senha foram enviadas. Verifique também o spam.',
      );
    } catch {
      Alert.alert('Falha', 'Não foi possível enviar o e-mail agora.');
    } finally {
      setSending(false);
    }
  }

  function confirmLogout() {
    Alert.alert('Sair da conta', 'Você precisará entrar de novo neste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  const initials = (profile?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space(4),
        paddingHorizontal: theme.space(4),
        paddingBottom: theme.space(10),
      }}
    >
      <Text style={styles.title}>Perfil</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.email} numberOfLines={1}>{profile?.email ?? user?.email ?? '—'}</Text>
          <Text style={styles.role}>{profile ? roleLabels[profile.role] : 'Sem perfil'}</Text>
        </View>
      </View>

      <Card>
        <Row label="Servidor" value={API_BASE.replace('https://', '')} />
        <Row label="Versão do app" value={Constants.expoConfig?.version ?? '—'} />
        <Row label="Conta Firebase" value={user?.uid ? `${user.uid.slice(0, 10)}…` : '—'} />
      </Card>

      <Pressable onPress={changePassword} disabled={sending} style={[styles.action, sending && { opacity: 0.6 }]}>
        <Ionicons name="key-outline" size={18} color={theme.color.text} />
        <Text style={styles.actionText}>{sending ? 'Enviando…' : 'Trocar senha por e-mail'}</Text>
      </Pressable>

      <Pressable onPress={() => Linking.openURL(API_BASE)} style={styles.action}>
        <Ionicons name="globe-outline" size={18} color={theme.color.text} />
        <Text style={styles.actionText}>Abrir o sistema web</Text>
      </Pressable>

      <Pressable onPress={confirmLogout} style={[styles.action, styles.danger]}>
        <Ionicons name="log-out-outline" size={18} color={theme.color.danger} />
        <Text style={[styles.actionText, { color: theme.color.danger }]}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800', marginBottom: theme.space(5) },
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.space(4), marginBottom: theme.space(5) },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.color.accentSoft,
    borderWidth: 1,
    borderColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: theme.color.accent, fontWeight: '900', fontSize: theme.font.size.lg },
  email: { color: theme.color.text, fontSize: theme.font.size.md, fontWeight: '700' },
  role: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginTop: 2 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(4),
    marginBottom: theme.space(3),
  },
  danger: { borderColor: `${theme.color.danger}55` },
  actionText: { color: theme.color.text, fontWeight: '700', fontSize: theme.font.size.sm },
});
