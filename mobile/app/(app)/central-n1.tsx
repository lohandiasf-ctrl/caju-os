import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, ApiError } from '../../src/api/client';
import { useApi } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/context';
import type { JiraTicket, OperationalDashboard } from '../../src/api/types';
import { relativeAge, toTicket, STATUS_COLOR } from '../../src/domain/tickets';
import { Badge, Card, ErrorState, Loading, Metric } from '../../src/ui/kit';
import { theme } from '../../src/theme';

type IssuesResponse = { issues: JiraTicket[] };

export default function CentralN1Screen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const [claiming, setClaiming] = useState<string | null>(null);

  const dashboard = useApi<OperationalDashboard>('/api/operational-dashboard');
  const issues = useApi<IssuesResponse>('/api/jira/issues?limit=100');

  const queue = useMemo(
    () => (issues.data?.issues ?? []).map(toTicket).filter((ticket) => ticket.status !== 'Direcionado'),
    [issues.data],
  );

  /** Assume o chamado — mesmo PUT que a web usa (só perfil n1 pode). */
  const claim = useCallback(
    async (ticketKey: string) => {
      setClaiming(ticketKey);
      try {
        await apiFetch(`/api/n1-tickets/${ticketKey}`, {
          method: 'PUT',
          body: JSON.stringify({ action: 'claim' }),
        });
        Alert.alert('Chamado assumido', `${ticketKey} está com você.`);
        dashboard.reload();
      } catch (error) {
        Alert.alert(
          'Não foi possível assumir',
          error instanceof ApiError ? error.message : 'Falha ao assumir o chamado.',
        );
      } finally {
        setClaiming(null);
      }
    },
    [dashboard],
  );

  if (dashboard.loading) return <Loading label="Carregando a Central N1…" />;
  if (dashboard.error) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;

  const data = dashboard.data;
  const validation = data?.validationQueue ?? [];
  const canClaim = profile?.role === 'n1';

  return (
    <FlatList
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space(4),
        paddingHorizontal: theme.space(4),
        paddingBottom: theme.space(8),
      }}
      data={queue}
      keyExtractor={(ticket) => ticket.id}
      refreshControl={
        <RefreshControl
          refreshing={dashboard.refreshing}
          onRefresh={() => {
            dashboard.refresh();
            issues.refresh();
          }}
          tintColor={theme.color.accent}
        />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Central N1</Text>
          <Text style={styles.subtitle}>Fila de atendimento e validação</Text>

          <View style={styles.metrics}>
            <Metric label="Na fila" value={String(queue.length)} />
            <Metric
              label="Aguardando validação"
              value={String(validation.length)}
              tone={validation.length ? theme.color.warning : theme.color.text}
            />
          </View>

          {data?.n1?.length ? (
            <Card>
              <Text style={styles.sectionInline}>Carga por atendente</Text>
              {data.n1.map((person) => (
                <View key={person.email} style={styles.personRow}>
                  <Text style={styles.personEmail} numberOfLines={1}>{person.email}</Text>
                  <Text style={styles.personCount}>{person.count}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {validation.length ? (
            <>
              <Text style={styles.sectionTitle}>Aguardando validação</Text>
              {validation.map((item) => (
                <Card key={item.ticketKey} onPress={() => router.push(`/(app)/chamado/${item.ticketKey}`)}>
                  <View style={styles.head}>
                    <Text style={styles.key}>{item.ticketKey}</Text>
                    <Text style={styles.age}>{relativeAge(item.submittedAt)}</Text>
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    Enviado por {item.submittedByName || item.submittedByEmail}
                  </Text>
                </Card>
              ))}
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Fila de chamados</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push(`/(app)/chamado/${item.id}`)}>
          <View style={styles.head}>
            <Text style={styles.key}>{item.id}</Text>
            <Badge label={item.status} color={STATUS_COLOR[item.status]} />
          </View>
          <Text style={styles.ticketTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.store} · {item.city}
          </Text>
          {canClaim ? (
            <Pressable
              onPress={() => claim(item.id)}
              disabled={claiming === item.id}
              style={[styles.claim, claiming === item.id && { opacity: 0.6 }]}
            >
              <Text style={styles.claimText}>
                {claiming === item.id ? 'Assumindo…' : 'Assumir chamado'}
              </Text>
            </Pressable>
          ) : null}
        </Card>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Nenhum chamado na fila.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  title: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800' },
  subtitle: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginBottom: theme.space(4) },
  metrics: { flexDirection: 'row', gap: theme.space(2), marginBottom: theme.space(4) },
  sectionInline: { color: theme.color.text, fontWeight: '800', fontSize: theme.font.size.sm, marginBottom: theme.space(2) },
  sectionTitle: {
    color: theme.color.textMuted,
    fontSize: theme.font.size.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.space(3),
    marginBottom: theme.space(2.5),
  },
  personRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: theme.space(3) },
  personEmail: { color: theme.color.textMuted, fontSize: theme.font.size.sm, flexShrink: 1 },
  personCount: { color: theme.color.text, fontSize: theme.font.size.sm, fontWeight: '800' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space(2) },
  key: { color: theme.color.accent, fontWeight: '800', fontSize: theme.font.size.sm },
  age: { color: theme.color.textMuted, fontSize: theme.font.size.xs },
  ticketTitle: { color: theme.color.text, fontSize: theme.font.size.md, fontWeight: '700' },
  meta: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginTop: 2 },
  claim: {
    marginTop: theme.space(3),
    borderWidth: 1,
    borderColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(2.5),
    alignItems: 'center',
  },
  claimText: { color: theme.color.accent, fontWeight: '800', fontSize: theme.font.size.sm },
  empty: { color: theme.color.textMuted, textAlign: 'center', paddingVertical: theme.space(12) },
});
