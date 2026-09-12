import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { API_BASE } from '../../src/api/client';
import { Card, ErrorState, Loading, Metric } from '../../src/ui/kit';
import { theme } from '../../src/theme';

/** Mesmo arquivo que a web consome em /data/technician-map.json. */
type CityCluster = {
  city: string;
  uf: string;
  address: string;
  lat: number;
  lng: number;
  technicians: number;
  onboarded: number;
  vehicles: number;
  avgTools: number;
  avgSpecialties: number;
};

export default function MapaScreen() {
  const insets = useSafeAreaInsets();
  const [clusters, setClusters] = useState<CityCluster[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [uf, setUf] = useState('Todos');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/data/technician-map.json`)
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar o mapa.');
        return response.json() as Promise<CityCluster[]>;
      })
      .then((value) => {
        if (!active) return;
        setClusters(value);
        setError(null);
      })
      .catch(() => active && setError('Falha ao carregar a cobertura de técnicos.'))
      .finally(() => active && setRefreshing(false));
    return () => {
      active = false;
    };
  }, [tick]);

  const ufs = useMemo(
    () => ['Todos', ...Array.from(new Set((clusters ?? []).map((item) => item.uf))).sort()],
    [clusters],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (clusters ?? [])
      .filter((item) => (uf === 'Todos' || item.uf === uf))
      .filter((item) => !term || item.city.toLowerCase().includes(term))
      .sort((a, b) => b.technicians - a.technicians);
  }, [clusters, query, uf]);

  const totals = useMemo(() => {
    const source = visible;
    return {
      cities: source.length,
      technicians: source.reduce((sum, item) => sum + item.technicians, 0),
      vehicles: source.reduce((sum, item) => sum + item.vehicles, 0),
      onboarded: source.reduce((sum, item) => sum + item.onboarded, 0),
    };
  }, [visible]);

  if (!clusters && !error) return <Loading label="Carregando cobertura…" />;
  if (error) return <ErrorState message={error} onRetry={() => setTick((value) => value + 1)} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space(4),
        paddingHorizontal: theme.space(4),
        paddingBottom: theme.space(8),
      }}
      data={visible}
      keyExtractor={(item) => `${item.city}-${item.uf}`}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setTick((value) => value + 1);
          }}
          tintColor={theme.color.accent}
        />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Cobertura</Text>
          <Text style={styles.subtitle}>Técnicos por cidade</Text>

          <View style={styles.metrics}>
            <Metric label="Cidades" value={String(totals.cities)} />
            <Metric label="Técnicos" value={String(totals.technicians)} />
            <Metric label="Com veículo" value={String(totals.vehicles)} tone={theme.color.success} />
            <Metric label="Onboarding ok" value={String(totals.onboarded)} tone={theme.color.info} />
          </View>

          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar cidade…"
            placeholderTextColor={theme.color.textMuted}
          />

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={ufs}
            keyExtractor={(item) => item}
            style={{ marginBottom: theme.space(4) }}
            renderItem={({ item }) => {
              const active = item === uf;
              return (
                <Pressable onPress={() => setUf(item)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && { color: theme.color.text }]}>{item}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => openInMaps(item)}>
          <View style={styles.head}>
            <Text style={styles.city} numberOfLines={1}>
              {item.city} <Text style={styles.uf}>/ {item.uf}</Text>
            </Text>
            <View style={styles.countPill}>
              <Ionicons name="people-outline" size={13} color={theme.color.accent} />
              <Text style={styles.count}>{item.technicians}</Text>
            </View>
          </View>
          <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
          <View style={styles.stats}>
            <Text style={styles.stat}>{item.vehicles} com veículo</Text>
            <Text style={styles.stat}>{item.onboarded} com onboarding</Text>
          </View>
          <View style={styles.openRow}>
            <Ionicons name="navigate-outline" size={14} color={theme.color.textMuted} />
            <Text style={styles.open}>Abrir no mapa do aparelho</Text>
          </View>
        </Card>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Nenhuma cidade encontrada.</Text>}
    />
  );
}

/**
 * O mapa embutido exigiria uma chave do Google Maps, que o projeto não tem —
 * a web usa Leaflet/OpenStreetMap, que não roda em nativo. Até a chave existir,
 * abrir no app de mapas do aparelho entrega a mesma navegação.
 */
function openInMaps(cluster: CityCluster) {
  const label = encodeURIComponent(`${cluster.city} - ${cluster.uf}`);
  const url = Platform.select({
    ios: `maps:0,0?q=${label}@${cluster.lat},${cluster.lng}`,
    default: `geo:${cluster.lat},${cluster.lng}?q=${cluster.lat},${cluster.lng}(${label})`,
  });
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${cluster.lat},${cluster.lng}`);
  });
}

const styles = StyleSheet.create({
  title: { color: theme.color.text, fontSize: theme.font.size.xxl, fontWeight: '800' },
  subtitle: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginBottom: theme.space(4) },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginBottom: theme.space(4) },
  search: {
    backgroundColor: theme.color.surface,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    color: theme.color.text,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    marginBottom: theme.space(3),
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    borderRadius: 999,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(1.5),
    marginRight: theme.space(2),
  },
  chipActive: { borderColor: theme.color.accent, backgroundColor: theme.color.accentSoft },
  chipText: { color: theme.color.textMuted, fontSize: theme.font.size.sm, fontWeight: '700' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.space(3) },
  city: { color: theme.color.text, fontSize: theme.font.size.md, fontWeight: '800', flexShrink: 1 },
  uf: { color: theme.color.textMuted, fontWeight: '700' },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.color.accentSoft,
    borderRadius: 999,
    paddingHorizontal: theme.space(2.5),
    paddingVertical: 3,
  },
  count: { color: theme.color.accent, fontWeight: '800', fontSize: theme.font.size.sm },
  address: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginTop: 2 },
  stats: { flexDirection: 'row', gap: theme.space(4), marginTop: theme.space(2) },
  stat: { color: theme.color.textMuted, fontSize: theme.font.size.xs },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.space(3) },
  open: { color: theme.color.textMuted, fontSize: theme.font.size.xs, fontWeight: '700' },
  empty: { color: theme.color.textMuted, textAlign: 'center', paddingVertical: theme.space(12) },
});
