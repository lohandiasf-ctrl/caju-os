import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { apiFetch, ApiError } from '../../../src/api/client';
import { useApi } from '../../../src/api/hooks';
import type { JiraDetails } from '../../../src/api/types';
import { formatDateTime, relativeAge, toTicket, STATUS_COLOR } from '../../../src/domain/tickets';
import { Badge, Card, ErrorState, Loading, Row } from '../../../src/ui/kit';
import { theme } from '../../../src/theme';

export default function TicketScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const details = useApi<JiraDetails>(key ? `/api/jira/issues/${key}` : null);

  /**
   * Envia evidências para o mesmo endpoint que a web usa
   * (POST /api/jira/issues/:key/attachments, multipart "files").
   */
  const sendEvidence = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[]) => {
      if (!assets.length || !key) return;
      setUploading(true);
      try {
        const form = new FormData();
        for (const asset of assets) {
          const name = asset.fileName ?? `evidencia-${Date.now()}.jpg`;
          form.append('files', {
            uri: asset.uri,
            name,
            type: asset.mimeType ?? 'image/jpeg',
          } as unknown as Blob);
        }
        // FormData no RN precisa ir sem Content-Type manual: o fetch monta o
        // boundary sozinho.
        await apiFetch(`/api/jira/issues/${key}/attachments`, { method: 'POST', body: form });
        Alert.alert('Evidência enviada', `${assets.length} arquivo(s) anexado(s) ao ${key}.`);
        details.reload();
      } catch (error) {
        Alert.alert(
          'Falha ao enviar',
          error instanceof ApiError ? error.message : 'Não foi possível anexar a evidência.',
        );
      } finally {
        setUploading(false);
      }
    },
    [key, details],
  );

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Câmera bloqueada', 'Autorize o acesso à câmera nas configurações do aparelho.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) await sendEvidence(result.assets);
  }, [sendEvidence]);

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });
    if (!result.canceled) await sendEvidence(result.assets);
  }, [sendEvidence]);

  if (details.loading) return <Loading label={`Carregando ${key}…`} />;
  if (details.error) return <ErrorState message={details.error} onRetry={details.reload} />;
  if (!details.data) return <ErrorState message="Chamado não encontrado." />;

  const issue = details.data;
  const ticket = toTicket(issue);

  return (
    <>
      <Stack.Screen options={{ title: issue.key }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.color.background }}
        contentContainerStyle={{
          paddingTop: insets.top + theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingBottom: theme.space(10),
        }}
        refreshControl={
          <RefreshControl refreshing={details.refreshing} onRefresh={details.refresh} tintColor={theme.color.accent} />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={theme.color.accent} />
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>

        <Text style={styles.key}>{issue.key}</Text>
        <Text style={styles.summary}>{issue.summary}</Text>

        <View style={styles.badges}>
          <Badge label={ticket.status} color={STATUS_COLOR[ticket.status]} />
          <Badge
            label={issue.priority || 'Sem prioridade'}
            color={ticket.priority === 'Alta' ? theme.color.danger : theme.color.info}
          />
        </View>

        <Card>
          <Row label="Etapa no Jira" value={issue.status} />
          <Row label="Loja" value={ticket.store} />
          <Row label="Cidade" value={ticket.city} />
          <Row label="Técnico" value={issue.assignee ?? 'Não atribuído'} />
          <Row label="Agendado para" value={formatDateTime(issue.scheduledAt)} />
          <Row label="Aberto em" value={formatDateTime(issue.createdAt)} />
          <Row label="Atualizado" value={`${formatDateTime(issue.updatedAt)} (${relativeAge(issue.updatedAt)})`} />
          <Row label="Tipo" value={issue.issueType || '—'} />
          <Row label="Projeto" value={issue.project || '—'} />
        </Card>

        <Text style={styles.sectionTitle}>Evidências</Text>
        <View style={styles.actions}>
          <Pressable onPress={takePhoto} disabled={uploading} style={[styles.action, uploading && { opacity: 0.6 }]}>
            <Ionicons name="camera-outline" size={20} color="#1A0E06" />
            <Text style={styles.actionText}>Tirar foto</Text>
          </Pressable>
          <Pressable
            onPress={pickFromGallery}
            disabled={uploading}
            style={[styles.action, styles.actionGhost, uploading && { opacity: 0.6 }]}
          >
            <Ionicons name="images-outline" size={20} color={theme.color.accent} />
            <Text style={[styles.actionText, { color: theme.color.accent }]}>Da galeria</Text>
          </Pressable>
        </View>
        {uploading ? (
          <View style={styles.uploading}>
            <ActivityIndicator color={theme.color.accent} />
            <Text style={styles.uploadingText}>Enviando para o Jira…</Text>
          </View>
        ) : null}

        {issue.attachments.length ? (
          <Card>
            {issue.attachments.map((attachment) => (
              <View key={attachment.id} style={styles.attachment}>
                <Ionicons
                  name={attachment.mimeType?.startsWith('image/') ? 'image-outline' : 'document-outline'}
                  size={18}
                  color={theme.color.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.attachmentName} numberOfLines={1}>{attachment.filename}</Text>
                  <Text style={styles.attachmentMeta}>
                    {formatSize(attachment.size)} · {attachment.author ?? 'sem autor'} · {relativeAge(attachment.createdAt)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : (
          <Text style={styles.emptyLine}>Nenhuma evidência anexada ainda.</Text>
        )}

        {issue.description ? (
          <>
            <Text style={styles.sectionTitle}>Descrição</Text>
            <Card>
              <Text style={styles.body}>{issue.description}</Text>
            </Card>
          </>
        ) : null}

        {issue.internalComments?.length ? (
          <>
            <Text style={styles.sectionTitle}>Comentários internos</Text>
            {issue.internalComments.map((comment) => (
              <Card key={comment.id}>
                <Text style={styles.commentHead}>
                  {comment.author ?? 'Sem autor'} · {relativeAge(comment.createdAt)}
                </Text>
                <Text style={styles.body}>{comment.body}</Text>
              </Card>
            ))}
          </>
        ) : null}

        <Pressable style={styles.jiraLink} onPress={() => Linking.openURL(issue.jiraUrl)}>
          <Ionicons name="open-outline" size={16} color={theme.color.textMuted} />
          <Text style={styles.jiraLinkText}>Abrir no Jira</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function formatSize(bytes: number) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: theme.space(3) },
  backText: { color: theme.color.accent, fontWeight: '700', fontSize: theme.font.size.sm },
  key: { color: theme.color.accent, fontWeight: '800', fontSize: theme.font.size.sm },
  summary: { color: theme.color.text, fontSize: theme.font.size.xl, fontWeight: '800', marginTop: 2 },
  badges: { flexDirection: 'row', gap: theme.space(2), marginVertical: theme.space(4) },
  sectionTitle: {
    color: theme.color.textMuted,
    fontSize: theme.font.size.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.space(4),
    marginBottom: theme.space(2.5),
  },
  actions: { flexDirection: 'row', gap: theme.space(3), marginBottom: theme.space(3) },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(3.5),
  },
  actionGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.color.accent },
  actionText: { color: '#1A0E06', fontWeight: '800', fontSize: theme.font.size.sm },
  uploading: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2), marginBottom: theme.space(3) },
  uploadingText: { color: theme.color.textMuted, fontSize: theme.font.size.sm },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: theme.space(3), paddingVertical: theme.space(2) },
  attachmentName: { color: theme.color.text, fontSize: theme.font.size.sm, fontWeight: '600' },
  attachmentMeta: { color: theme.color.textMuted, fontSize: theme.font.size.xs, marginTop: 1 },
  emptyLine: { color: theme.color.textMuted, fontSize: theme.font.size.sm, marginBottom: theme.space(3) },
  body: { color: theme.color.text, fontSize: theme.font.size.sm, lineHeight: 21 },
  commentHead: { color: theme.color.textMuted, fontSize: theme.font.size.xs, marginBottom: theme.space(2), fontWeight: '700' },
  jiraLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    paddingVertical: theme.space(5),
  },
  jiraLinkText: { color: theme.color.textMuted, fontSize: theme.font.size.sm, fontWeight: '700' },
});
