import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '../../src/api/hooks';
import { relativeAge } from '../../src/domain/tickets';
import { Badge, Card, ErrorState, Loading, Row } from '../../src/ui/kit';
import { theme } from '../../src/theme';

type SpareRow = {
  id: number;
  ticketKey: string;
  status: string;
  city: string | null;
  equipment: string | null;
  trackingCode: string | null;
  expectedDelivery: string | null;
  technician: string | null;
  supplier: string | null;
  updatedAt: string | null;
  tracking: { status: string | null; carrier: string | null; lastEvent: string | null; updatedAt: string | null } | null;
};

type SparesResponse = {
  items: SpareRow[];
  sync: { push?: boolean; pull?: boolean; pushTargets?: number };
};

export default function SparesScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const spares = useApi<SparesResponse>('/api/spares');

  const rows = useMemo(() => {
    const items = spares.data?.items ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((row) =>
      [row.ticketKey, row.city, row.equipment, row.trackingCode, row.technician, row.supplier]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [spares.data, query]);

  if (spares.loading) return <Loading label="Carregando spares…" />;
  if (spares.error) return <ErrorState message={spares.error} onRetry={spares.reload} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space(4),
        paddingHorizontal: theme.space(4),
        paddingBottom: theme.space(8),
      }}
      data={rows}
      keyExtractor={(row) => String(row.id)}
      refreshControl={
        <RefreshControl refreshing={spares.refreshing} onRefresh={spares.refresh} tintColor={theme.color.accent} />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Spares</Text>
          <Text style={styles.subtitle}>
            {rows.length} de {spares.data?.items.length ?? 0} peças
            {spares.data?.sync?.pull ? ' · planilha sincronizada' : ''}
          </Text>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por chamado, cidade, rastreio…"
            placeholderTextColor={theme.color.textMuted}
            autoCapitalize="none"
          />
        </View>
      }
      renderItem={({ item }) => <SpareCard row={item} />}
      ListEmptyComponent={<Text style={styles.empty}>Nenhum spare encontrado.</Text>}
    />
  );
}

function SpareCard({ row }: { row: SpareRow }) {
  const [open, setOpen] = useState(false);
  const status = (row.status || 'PENDENTE').toUpperCase();
  const tone = status.includes('ENTREG')
    ? theme.color.success
    : status.includes('TRANSIT') || status.includes('ENVIAD')
      ? theme.color.info
      : theme.color.warning;

  return (
    <Card onPress={() => setOpen((value) => !value)}>
      <View style={styles.head}>
        <Text style={styles.key}>{row.ticketKey}</Text>
        <Badge label={status} color={tone} />
      </View>
      <Text style={styles.equipment} numberOfLines={open ? undefined : 1}>
        {row.equipment || 'Equipamento não informado'}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {row.city || 'Cidade não informada'} · {row.technician || 'sem técnico'}
      </Text>

      {open ? (
        <View style={styles.details}>
          <Row label="Rastreio" value={row.trackingCode || '—'} />
          <Row label="Transportadora" value={row.tracking?.carrier || '—'} />
          <Row label="Status do rastreio" value={row.tracking?.status || 'sem consulta'} />
          <Row label="Último evento" value={row.tracking?.lastEvent || '—'} />
          <Row label="Entrega prevista" value={row.expectedDelivery || '—'} />
          <Row label="Fornecedor" value={row.supplier || '—'} />
          <Row label="Atualizado" value={relativeAge(row.updatedAt ?? undefined)} />
        </View>
      ) : (
        <Pressable onPress={() => setOpen(true)}>
          <Text style={styles.more}>Ver rastreio</Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800' },
  subtitle: { color: theme.color.textMuted, fontSize: theme.font.size.sm },
  search: {
    backgroundColor: theme.color.surface,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    color: theme.color.text,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    marginVertical: theme.space(4),
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space(2) },
  key: { color: theme.color.accent, fontWeight: '800', fontSize: theme.font.size.sm },
  equipment: { color: theme.color.text, fontSize: theme.font.size.md, fontWeight: '700' },
  meta: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginTop: 2 },
  details: { marginTop: theme.space(3), paddingTop: theme.space(2), borderTopWidth: 1, borderTopColor: theme.color.border },
  more: { color: theme.color.accent, fontSize: theme.font.size.xs, fontWeight: '700', marginTop: theme.space(2) },
  empty: { color: theme.color.textMuted, textAlign: 'center', paddingVertical: theme.space(12) },
});
