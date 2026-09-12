import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '../../src/api/hooks';
import type { JiraTicket, OperationalDashboard, Status, Ticket } from '../../src/api/types';
import { relativeAge, STATUS_COLOR, STATUS_COLUMNS, toTicket, formatCurrency } from '../../src/domain/tickets';
import { Badge, Card, ErrorState, Loading, Metric } from '../../src/ui/kit';
import { theme } from '../../src/theme';

type IssuesResponse = { issues: JiraTicket[]; nextPageToken?: string | null };

export default function OperacaoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [column, setColumn] = useState<Status>('Pendente de agendamento');

  const issues = useApi<IssuesResponse>('/api/jira/issues?limit=100');
  const dashboard = useApi<OperationalDashboard>('/api/operational-dashboard');

  const tickets = useMemo(
    () => (issues.data?.issues ?? []).map(toTicket),
    [issues.data],
  );

  const counts = useMemo(() => {
    const result = {} as Record<Status, number>;
    for (const status of STATUS_COLUMNS) result[status] = 0;
    for (const ticket of tickets) result[ticket.status] += 1;
    return result;
  }, [tickets]);

  const visible = useMemo(
    () => tickets.filter((ticket) => ticket.status === column),
    [tickets, column],
  );

  if (issues.loading) return <Loading label="Carregando a fila operacional…" />;
  if (issues.error) return <ErrorState message={issues.error} onRetry={issues.reload} />;

  const metrics = dashboard.data?.metrics;
  const alerts = dashboard.data?.alerts ?? [];

  return (
    <FlatList
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space(4),
        paddingHorizontal: theme.space(4),
        paddingBottom: theme.space(8),
      }}
      data={visible}
      keyExtractor={(ticket) => ticket.id}
      refreshControl={
        <RefreshControl
          refreshing={issues.refreshing}
          onRefresh={() => {
            issues.refresh();
            dashboard.refresh();
          }}
          tintColor={theme.color.accent}
        />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Operação</Text>
          <Text style={styles.subtitle}>{tickets.length} chamados na fila</Text>

          {metrics ? (
            <View style={styles.metrics}>
              <Metric label="Ativos" value={String(metrics.active)} />
              <Metric
                label="Atrasados"
                value={String(metrics.overdue)}
                tone={metrics.overdue > 0 ? theme.color.danger : theme.color.text}
              />
              <Metric label="Agendados" value={String(metrics.scheduled)} />
              <Metric
                label="Margem"
                value={formatCurrency(metrics.marginCents)}
                tone={metrics.marginCents >= 0 ? theme.color.success : theme.color.danger}
              />
            </View>
          ) : null}

          {alerts.length > 0 ? (
            <Card style={{ borderColor: `${theme.color.danger}55` }}>
              <Text style={styles.alertTitle}>{alerts.length} alertas de SLA</Text>
              {alerts.slice(0, 3).map((alert) => (
                <Text key={`${alert.ticketKey}-${alert.message}`} style={styles.alertLine} numberOfLines={2}>
                  <Text style={{ color: alert.level === 'critical' ? theme.color.danger : theme.color.warning }}>
                    ● </Text>
                  {alert.ticketKey} — {alert.message}
                </Text>
              ))}
            </Card>
          ) : null}

          {/* As cinco colunas do kanban viram abas roláveis: num celular,
              colunas lado a lado não cabem. */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={STATUS_COLUMNS}
            keyExtractor={(status) => status}
            style={{ marginBottom: theme.space(4) }}
            renderItem={({ item }) => {
              const active = item === column;
              return (
                <Pressable
                  onPress={() => setColumn(item)}
                  style={[
                    styles.tab,
                    active && { backgroundColor: `${STATUS_COLOR[item]}22`, borderColor: STATUS_COLOR[item] },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: STATUS_COLOR[item] }]} />
                  <Text style={[styles.tabText, active && { color: theme.color.text }]}>{item}</Text>
                  <Text style={[styles.tabCount, active && { color: STATUS_COLOR[item] }]}>{counts[item]}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      }
      renderItem={({ item }) => (
        <TicketCard ticket={item} onPress={() => router.push(`/(app)/chamado/${item.id}`)} />
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>Nenhum chamado em “{column}”.</Text>
      }
    />
  );
}

function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress: () => void }) {
  const priorityTone =
    ticket.priority === 'Alta'
      ? theme.color.danger
      : ticket.priority === 'Baixa'
        ? theme.color.textMuted
        : theme.color.info;

  return (
    <Card onPress={onPress}>
      <View style={styles.cardHead}>
        <Text style={styles.cardKey}>{ticket.id}</Text>
        <Badge label={ticket.priority} color={priorityTone} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{ticket.title}</Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {ticket.store} · {ticket.city}
      </Text>
      <View style={styles.cardFoot}>
        <Text style={styles.cardTech} numberOfLines={1}>
          {ticket.technician ?? 'Sem técnico atribuído'}
        </Text>
        <Text style={styles.cardAge}>{relativeAge(ticket.updatedAt)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800' },
  subtitle: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginBottom: theme.space(4) },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginBottom: theme.space(4) },
  alertTitle: { color: theme.color.danger, fontWeight: '800', fontSize: theme.font.size.sm, marginBottom: theme.space(2) },
  alertLine: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginBottom: 2 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    borderRadius: 999,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(2),
    marginRight: theme.space(2),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { color: theme.color.textMuted, fontSize: theme.font.size.sm, fontWeight: '700' },
  tabCount: { color: theme.color.textMuted, fontSize: theme.font.size.sm, fontWeight: '800' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space(2) },
  cardKey: { color: theme.color.accent, fontWeight: '800', fontSize: theme.font.size.sm },
  cardTitle: { color: theme.color.text, fontSize: theme.font.size.md, fontWeight: '700', marginBottom: theme.space(1) },
  cardMeta: { color: theme.color.textMuted, fontSize: theme.font.size.sm },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.space(3),
    paddingTop: theme.space(3),
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    gap: theme.space(3),
  },
  cardTech: { color: theme.color.text, fontSize: theme.font.size.sm, flexShrink: 1 },
  cardAge: { color: theme.color.textMuted, fontSize: theme.font.size.xs },
  empty: { color: theme.color.textMuted, textAlign: 'center', paddingVertical: theme.space(12) },
});
