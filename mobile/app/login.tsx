import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../src/firebase';
import { theme } from '../src/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // A navegação é do Gate em _layout.tsx, ao ver a sessão mudar.
    } catch (cause) {
      setError(authErrorMessage(cause));
      setLoading(false);
    }
  }

  async function resetPassword() {
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Informe seu e-mail para receber a recuperação de senha.');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      // O Firebase não diz se a conta existe (proteção contra enumeração),
      // então a mensagem não promete entrega.
      setMessage('Se existir uma conta com este e-mail, as instruções foram enviadas. Verifique também o spam.');
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setResetting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.brandMark}>Caju OS</Text>
          <Text style={styles.brandLine}>Comando operacional</Text>
        </View>

        <Text style={styles.heading}>Entrar</Text>
        <Text style={styles.hint}>Use o mesmo acesso do sistema web.</Text>

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="voce@cajutech.net"
          placeholderTextColor={theme.color.textMuted}
          editable={!loading}
        />

        <Text style={styles.label}>Senha</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="••••••••"
            placeholderTextColor={theme.color.textMuted}
            editable={!loading}
            onSubmitEditing={submit}
          />
          <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.reveal}>
            <Text style={styles.revealText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={loading}
          style={({ pressed }) => [styles.button, (pressed || loading) && { opacity: 0.75 }]}
        >
          {loading ? <ActivityIndicator color="#1A0E06" /> : <Text style={styles.buttonText}>Entrar</Text>}
        </Pressable>

        <Pressable onPress={resetPassword} disabled={resetting} style={styles.linkButton}>
          <Text style={styles.link}>
            {resetting ? 'Enviando…' : 'Esqueci minha senha'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function authErrorMessage(cause: unknown) {
  if (cause instanceof FirebaseError) {
    switch (cause.code) {
      case 'auth/invalid-email':
        return 'E-mail inválido.';
      case 'auth/user-disabled':
        return 'Esta conta está desativada.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Aguarde alguns minutos.';
      case 'auth/network-request-failed':
        return 'Sem conexão com a internet.';
      default:
        return 'Não foi possível entrar. Tente de novo.';
    }
  }
  return 'Não foi possível entrar. Tente de novo.';
}

const styles = StyleSheet.create({
  container: { padding: theme.space(6), paddingTop: theme.space(20), gap: 0 },
  brand: { marginBottom: theme.space(10) },
  brandMark: { color: theme.color.accent, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  brandLine: {
    color: theme.color.textMuted,
    fontSize: theme.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '700',
    marginTop: 2,
  },
  heading: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800' },
  hint: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginBottom: theme.space(6) },
  label: {
    color: theme.color.textMuted,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.space(1.5),
  },
  input: {
    backgroundColor: theme.color.surface,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    color: theme.color.text,
    fontSize: theme.font.size.md,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3.5),
    marginBottom: theme.space(4),
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2), marginBottom: theme.space(4) },
  reveal: { paddingHorizontal: theme.space(3), paddingVertical: theme.space(3) },
  revealText: { color: theme.color.textMuted, fontSize: theme.font.size.sm, fontWeight: '700' },
  error: { color: theme.color.danger, fontSize: theme.font.size.sm, marginBottom: theme.space(3) },
  message: { color: theme.color.success, fontSize: theme.font.size.sm, marginBottom: theme.space(3) },
  button: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(4),
    alignItems: 'center',
    marginTop: theme.space(2),
  },
  buttonText: { color: '#1A0E06', fontSize: theme.font.size.md, fontWeight: '800' },
  linkButton: { alignItems: 'center', paddingVertical: theme.space(4) },
  link: { color: theme.color.accent, fontSize: theme.font.size.sm, fontWeight: '700' },
});
