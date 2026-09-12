import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '../../src/api/hooks';
import type { FinancialIssue, PayoutRule, TechnicianRevenue } from '../../src/api/types';
import { formatReais } from '../../src/domain/tickets';
import { Card, ErrorState, Loading, Metric } from '../../src/ui/kit';
import { theme } from '../../src/theme';

type FinanceResponse = { issues: FinancialIssue[] };

const PERIODS = [
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
  { label: '6 meses', days: 180 },
] as const;

export default function FinanceiroScreen() {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<number>(30);

  const finance = useApi<FinanceResponse>('/api/jira/finance');
  const rule = useApi<PayoutRule>('/api/finance/rules');

  const periodIssues = useMemo(() => {
    const issues = finance.data?.issues ?? [];
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return issues.filter((issue) => {
      const updated = Date.parse(issue.updatedAt);
      return Number.isFinite(updated) ? updated >= since : true;
    });
  }, [finance.data, days]);

  const technicians = useMemo(
    () => groupTechnicians(periodIssues, rule.data ?? { firstTicketCents: 7000, additionalTicketCents: 7000 }),
    [periodIssues, rule.data],
  );

  const revenue = periodIssues.reduce((sum, issue) => sum + issue.totalValue, 0);
  const payout = technicians.reduce((sum, technician) => sum + technician.payout, 0);
  const margin = revenue - payout;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

  if (finance.loading) return <Loading label="Carregando financeiro…" />;
  if (finance.error) return <ErrorState message={finance.error} onRetry={finance.reload} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space(4),
        paddingHorizontal: theme.space(4),
        paddingBottom: theme.space(8),
      }}
      data={technicians}
      keyExtractor={(technician) => technician.name}
      refreshControl={
        <RefreshControl
          refreshing={finance.refreshing}
          onRefresh={() => {
            finance.refresh();
            rule.refresh();
          }}
          tintColor={theme.color.accent}
        />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Financeiro</Text>
          <Text style={styles.subtitle}>{periodIssues.length} chamados movimentados no período</Text>

          <View style={styles.periods}>
            {PERIODS.map((period) => {
              const active = period.days === days;
              return (
                <Pressable
                  key={period.days}
                  onPress={() => setDays(period.days)}
                  style={[styles.period, active && styles.periodActive]}
                >
                  <Text style={[styles.periodText, active && { color: theme.color.text }]}>{period.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.metrics}>
            <Metric label="Faturamento previsto" value={formatReais(revenue)} tone={theme.color.success} />
            <Metric label="Repasses" value={formatReais(payout)} tone={theme.color.warning} />
            <Metric
              label="Margem Caju"
              value={formatReais(margin)}
              tone={margin >= 0 ? theme.color.success : theme.color.danger}
            />
            <Metric label="Margem %" value={`${marginPercent.toFixed(1)}%`} />
          </View>

          {rule.data ? (
            <Card>
              <Text style={styles.ruleTitle}>Regra de repasse</Text>
              <Text style={styles.ruleLine}>
                1º chamado: {formatReais(rule.data.firstTicketCents / 100)} · demais:{' '}
                {formatReais(rule.data.additionalTicketCents / 100)}
              </Text>
              <Text style={styles.ruleNote}>A alteração da regra continua na web (perfil gerência).</Text>
            </Card>
          ) : null}

          <Text style={styles.sectionTitle}>Receita por técnico</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Card>
          <View style={styles.head}>
            <Text style={styles.techName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.techTickets}>{item.tickets} chamados</Text>
          </View>
          <View style={styles.techRow}>
            <Text style={styles.techLabel}>Receita</Text>
            <Text style={styles.techValue}>{formatReais(item.revenue)}</Text>
          </View>
          <View style={styles.techRow}>
            <Text style={styles.techLabel}>Repasse</Text>
            <Text style={styles.techValue}>{formatReais(item.payout)}</Text>
          </View>
          <View style={styles.techRow}>
            <Text style={styles.techLabel}>Margem</Text>
            <Text style={[styles.techValue, { color: item.margin >= 0 ? theme.color.success : theme.color.danger }]}>
              {formatReais(item.margin)}
            </Text>
          </View>
        </Card>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Nenhuma receita encontrada no período.</Text>}
    />
  );
}

/** Mesmo cálculo de app/financeiro/page.tsx: 1ª faixa no primeiro chamado. */
function groupTechnicians(issues: FinancialIssue[], rule: PayoutRule): TechnicianRevenue[] {
  const grouped = new Map<string, { tickets: number; revenue: number }>();
  for (const issue of issues) {
    if (!issue.technician) continue;
    const current = grouped.get(issue.technician) ?? { tickets: 0, revenue: 0 };
    current.tickets += 1;
    current.revenue += issue.totalValue;
    grouped.set(issue.technician, current);
  }
  return Array.from(grouped.entries())
    .map(([name, data]) => {
      const payout =
        (data.tickets ? rule.firstTicketCents : 0) / 100 +
        (Math.max(0, data.tickets - 1) * rule.additionalTicketCents) / 100;
      return { name, ...data, payout, margin: data.revenue - payout };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

const styles = StyleSheet.create({
  title: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800' },
  subtitle: { color: theme.color.textMuted, fontSize: theme.font.size.sm },
  periods: { flexDirection: 'row', gap: theme.space(2), marginVertical: theme.space(4) },
  period: {
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    borderRadius: 999,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
  },
  periodActive: { borderColor: theme.color.accent, backgroundColor: theme.color.accentSoft },
  periodText: { color: theme.color.textMuted, fontSize: theme.font.size.sm, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginBottom: theme.space(4) },
  ruleTitle: { color: theme.color.text, fontWeight: '800', fontSize: theme.font.size.sm },
  ruleLine: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginTop: theme.space(2) },
  ruleNote: { color: theme.color.textMuted, fontSize: theme.font.size.xs, marginTop: theme.space(2), fontStyle: 'italic' },
  sectionTitle: {
    color: theme.color.textMuted,
    fontSize: theme.font.size.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.space(2),
    marginBottom: theme.space(2.5),
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space(2) },
  techName: { color: theme.color.text, fontWeight: '800', fontSize: theme.font.size.md, flexShrink: 1 },
  techTickets: { color: theme.color.textMuted, fontSize: theme.font.size.xs },
  techRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  techLabel: { color: theme.color.textMuted, fontSize: theme.font.size.sm },
  techValue: { color: theme.color.text, fontSize: theme.font.size.sm, fontWeight: '700' },
  empty: { color: theme.color.textMuted, textAlign: 'center', paddingVertical: theme.space(12) },
});
