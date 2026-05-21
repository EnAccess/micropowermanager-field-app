import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  ACCEPTED_DOC_MIME_TYPES,
  CustomerDocument,
  DocumentAsset,
  MAX_DOCS_PER_CUSTOMER,
  MAX_DOC_BYTES,
  deleteCustomerDocument,
  downloadCustomerDocument,
  listCustomerDocuments,
  uploadCustomerDocument,
} from '@/api/customerDocuments';
import { useSession } from '@/auth/SessionContext';
import { fonts, radii, semantic, spacing } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Callout } from './Callout';
import { Pill } from './Pill';
import { Text } from './Text';

type DocumentSectionProps = {
  customerId: number;
  showTitle?: boolean;
};

const DOC_TYPE_OPTIONS = [
  { value: 'contract', label: 'Contract' },
  { value: 'questionnaire', label: 'Questionnaire' },
  { value: 'id_document', label: 'ID document' },
  { value: 'other', label: 'Other' },
] as const;

type PendingPick = { asset: DocumentAsset } | null;

export function DocumentSection({
  customerId,
  showTitle = true,
}: DocumentSectionProps) {
  const { api, environment } = useSession();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingPick>(null);
  const [busy, setBusy] = useState<'camera' | 'file' | null>(null);
  const [previewingId, setPreviewingId] = useState<number | null>(null);

  const documentsQuery = useQuery({
    queryKey: ['customer-documents', customerId],
    queryFn: () => listCustomerDocuments(api!, customerId),
    enabled: !!api && Number.isFinite(customerId),
  });

  const docs = documentsQuery.data ?? [];
  const atCap = docs.length >= MAX_DOCS_PER_CUSTOMER;

  const uploadMutation = useMutation({
    mutationFn: async (input: { asset: DocumentAsset; type: string }) => {
      return uploadCustomerDocument(
        environment!,
        customerId,
        input.asset,
        input.type,
      );
    },
    onSuccess: (created) => {
      queryClient.setQueryData<CustomerDocument[]>(
        ['customer-documents', customerId],
        (prev) => [...(prev ?? []), created],
      );
    },
    onError: (err) => {
      Alert.alert('Upload failed', extractError(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: number) =>
      deleteCustomerDocument(api!, documentId),
    onMutate: async (documentId) => {
      await queryClient.cancelQueries({
        queryKey: ['customer-documents', customerId],
      });
      const previous = queryClient.getQueryData<CustomerDocument[]>([
        'customer-documents',
        customerId,
      ]);
      queryClient.setQueryData<CustomerDocument[]>(
        ['customer-documents', customerId],
        (prev) => (prev ?? []).filter((d) => d.id !== documentId),
      );
      return { previous };
    },
    onError: (err, _docId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['customer-documents', customerId],
          context.previous,
        );
      }
      Alert.alert('Could not delete', extractError(err));
    },
  });

  async function handleTakePhoto() {
    if (atCap) {
      Alert.alert(
        'Limit reached',
        `Maximum ${MAX_DOCS_PER_CUSTOMER} documents.`,
      );
      return;
    }
    setBusy('camera');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Camera permission needed',
          'Allow camera access in Settings to scan a document.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const image = result.assets[0];
      const pdfUri = await imageToPdf(image.uri);
      const size = await fileSize(pdfUri);
      if (size != null && size > MAX_DOC_BYTES) {
        Alert.alert(
          'Image too large',
          'Try again with a lower-resolution photo.',
        );
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      setPending({
        asset: {
          uri: pdfUri,
          name: `scan-${stamp}.pdf`,
          mimeType: 'application/pdf',
          size: size ?? undefined,
        },
      });
    } catch (err) {
      Alert.alert('Could not capture', extractError(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePickFile() {
    if (atCap) {
      Alert.alert(
        'Limit reached',
        `Maximum ${MAX_DOCS_PER_CUSTOMER} documents.`,
      );
      return;
    }
    setBusy('file');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_DOC_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      const mimeType = a.mimeType ?? guessMime(a.name);
      if (!ACCEPTED_DOC_MIME_TYPES.includes(mimeType)) {
        Alert.alert('Unsupported file', 'Only PDF and DOCX are allowed.');
        return;
      }
      if (a.size != null && a.size > MAX_DOC_BYTES) {
        Alert.alert('File too large', 'Maximum 5 MB. Pick a smaller file.');
        return;
      }
      setPending({
        asset: {
          uri: a.uri,
          name: a.name,
          mimeType,
          size: a.size ?? undefined,
        },
      });
    } catch (err) {
      Alert.alert('Could not pick file', extractError(err));
    } finally {
      setBusy(null);
    }
  }

  function commit(type: string) {
    if (!pending) return;
    const asset = pending.asset;
    setPending(null);
    uploadMutation.mutate({ asset, type });
  }

  async function handlePreview(doc: CustomerDocument) {
    if (previewingId != null) return;
    setPreviewingId(doc.id);
    try {
      const uri = await downloadCustomerDocument(environment!, doc);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          'Preview unavailable',
          'This device cannot open the file directly.',
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: doc.mime_type,
        dialogTitle: doc.original_name,
        UTI: doc.mime_type === 'application/pdf' ? 'com.adobe.pdf' : undefined,
      });
    } catch (err) {
      Alert.alert('Could not open', extractError(err));
    } finally {
      setPreviewingId(null);
    }
  }

  return (
    <View style={styles.root}>
      {showTitle ? (
        <View style={styles.titleRow}>
          <Text variant="sectionLabel" tone="muted">
            DOCUMENTS{' '}
            <Text variant="meta" tone="muted" style={styles.optional}>
              ({docs.length}/{MAX_DOCS_PER_CUSTOMER})
            </Text>
          </Text>
        </View>
      ) : null}

      {documentsQuery.isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={semantic.blue} />
        </View>
      ) : null}

      {docs.length > 0 ? (
        <View style={styles.list}>
          {docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              deleting={
                deleteMutation.isPending && deleteMutation.variables === doc.id
              }
              previewing={previewingId === doc.id}
              onPreview={() => handlePreview(doc)}
              onDelete={() =>
                confirmDelete(doc, () => deleteMutation.mutate(doc.id))
              }
            />
          ))}
        </View>
      ) : null}

      {!atCap ? (
        <View style={styles.tileRow}>
          <UploadTile
            icon="camera"
            label="Take photo"
            loading={busy === 'camera' || uploadMutation.isPending}
            onPress={handleTakePhoto}
          />
          <UploadTile
            icon="upload"
            label="Upload"
            loading={busy === 'file' || uploadMutation.isPending}
            onPress={handlePickFile}
          />
        </View>
      ) : (
        <Callout tone="info">
          <Text variant="meta" tone="secondary">
            Maximum {MAX_DOCS_PER_CUSTOMER} documents reached. Delete one to add
            another.
          </Text>
        </Callout>
      )}

      <BottomSheet visible={!!pending} onDismiss={() => setPending(null)}>
        <Text variant="screenTitle" style={styles.sheetTitle}>
          Document type
        </Text>
        {pending ? (
          <Text
            variant="meta"
            tone="muted"
            style={styles.sheetSubtitle}
            numberOfLines={1}
          >
            {pending.asset.name}
          </Text>
        ) : null}
        <View style={styles.typeOptions}>
          {DOC_TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => commit(opt.value)}
              style={({ pressed }) => [
                styles.typeOption,
                pressed && styles.typeOptionPressed,
              ]}
            >
              <Text variant="bodyEmphasis">{opt.label}</Text>
              <Feather name="chevron-right" size={18} color={semantic.ink3} />
            </Pressable>
          ))}
        </View>
        <Button
          tone="ghost"
          label="Cancel"
          onPress={() => setPending(null)}
          style={styles.sheetCancel}
        />
      </BottomSheet>
    </View>
  );
}

function UploadTile({
  icon,
  label,
  loading,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.tile,
        pressed && !loading && styles.tilePressed,
        loading && styles.tileDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={semantic.blue} />
      ) : (
        <Feather name={icon} size={22} color={semantic.blue} />
      )}
      <Text variant="bodyEmphasis" style={styles.tileLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function DocumentRow({
  doc,
  deleting,
  previewing,
  onPreview,
  onDelete,
}: {
  doc: CustomerDocument;
  deleting: boolean;
  previewing: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const isPdf = doc.mime_type === 'application/pdf';
  const rowBusy = deleting || previewing;
  return (
    <Pressable
      onPress={onPreview}
      disabled={rowBusy}
      style={({ pressed }) => [
        styles.row,
        pressed && !rowBusy && { opacity: 0.85 },
      ]}
    >
      <View style={styles.rowIcon}>
        {previewing ? (
          <ActivityIndicator color={semantic.blue} />
        ) : (
          <Feather
            name={isPdf ? 'file-text' : 'file'}
            size={20}
            color={semantic.blue}
          />
        )}
      </View>
      <View style={styles.rowBody}>
        <Text variant="bodyEmphasis" numberOfLines={1}>
          {doc.original_name}
        </Text>
        <View style={styles.rowMeta}>
          <Pill label={typeLabel(doc.type)} tone="blue" />
          <Text variant="meta" tone="muted">
            {formatBytes(doc.file_size)}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onDelete}
        disabled={rowBusy}
        hitSlop={8}
        style={({ pressed }) => [
          styles.deleteBtn,
          pressed && !rowBusy && { opacity: 0.6 },
          rowBusy && { opacity: 0.4 },
        ]}
      >
        {deleting ? (
          <ActivityIndicator color={semantic.red} size="small" />
        ) : (
          <Feather name="trash-2" size={18} color={semantic.red} />
        )}
      </Pressable>
    </Pressable>
  );
}

function confirmDelete(doc: CustomerDocument, onConfirm: () => void) {
  Alert.alert(
    'Delete document?',
    `Remove "${doc.original_name}". This can’t be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ],
  );
}

async function imageToPdf(imageUri: string): Promise<string> {
  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          html, body { margin: 0; padding: 0; }
          .page { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
          img { max-width: 100%; max-height: 100%; object-fit: contain; }
        </style>
      </head>
      <body><div class="page"><img src="${imageUri}" /></div></body>
    </html>`;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

async function fileSize(uri: string): Promise<number | null> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return blob.size;
  } catch {
    return null;
  }
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function typeLabel(type: string): string {
  const match = DOC_TYPE_OPTIONS.find((o) => o.value === type);
  if (match) return match.label;
  return type.replace(/_/g, ' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extractError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (
      err as {
        response?: {
          data?: { message?: string; errors?: Record<string, string[]> };
        };
      }
    ).response;
    const fieldErr = response?.data?.errors
      ? Object.values(response.data.errors).flat()[0]
      : undefined;
    if (fieldErr) return fieldErr;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Try again.';
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optional: {
    textTransform: 'none',
    letterSpacing: 0,
  },
  loadingRow: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: semantic.line,
    padding: spacing.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    borderStyle: 'dashed',
    borderRadius: radii.input,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileDisabled: {
    opacity: 0.5,
  },
  tileLabel: {
    color: semantic.ink2,
    fontFamily: fonts.ptBold,
  },
  sheetTitle: {
    marginBottom: spacing.xs,
  },
  sheetSubtitle: {
    marginBottom: spacing.md,
  },
  typeOptions: {
    gap: spacing.xs,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: semantic.line,
    backgroundColor: semantic.paper,
  },
  typeOptionPressed: {
    backgroundColor: semantic.bgSoft,
  },
  sheetCancel: {
    marginTop: spacing.md,
  },
});
