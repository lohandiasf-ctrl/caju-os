import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme';

export function Screen({ children, scroll = false, refreshControl }: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <View style={{ marginBottom: theme.space(4) }}>
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
      {content}
    </Pressable>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Metric({ label, value, tone = theme.color.text }: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.color.accent} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.subtitle, { textAlign: 'center' }]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Tentar de novo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.muted, { textAlign: 'center' }]}>{message}</Text>
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  scrollContent: { padding: theme.space(4), paddingBottom: theme.space(12) },
  title: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800' },
  subtitle: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginTop: 2 },
  muted: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginTop: theme.space(2) },
  card: {
    backgroundColor: theme.color.surface,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space(4),
    marginBottom: theme.space(3),
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: theme.space(2.5),
    paddingVertical: theme.space(1),
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: theme.font.size.xs, fontWeight: '700' },
  metric: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: theme.color.surfaceRaised,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(3),
  },
  metricLabel: {
    color: theme.color.textMuted,
    fontSize: theme.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  metricValue: { fontSize: theme.font.size.xl, fontWeight: '800', marginTop: theme.space(1) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space(6) },
  retry: {
    marginTop: theme.space(4),
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(5),
    paddingVertical: theme.space(2.5),
  },
  retryText: { color: '#1A0E06', fontWeight: '800' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(4),
    paddingVertical: theme.space(1.5),
  },
  rowLabel: { color: theme.color.textMuted, fontSize: theme.font.size.sm },
  rowValue: { color: theme.color.text, fontSize: theme.font.size.sm, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
