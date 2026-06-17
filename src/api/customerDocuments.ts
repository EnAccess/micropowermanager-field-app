import { AxiosInstance } from 'axios';
import * as FileSystem from 'expo-file-system/legacy';

import { Environment, apiUrl } from '@/config/environments';
import { readString } from '@/storage/secureStorage';

export type CustomerDocument = {
  id: number;
  person_id: number;
  category: string;
  type: string;
  name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  location: string;
  additional_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export const QUESTIONNAIRE_DOC_TYPE = 'questionnaire';

export const MAX_DOCS_PER_CUSTOMER = 3;
export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_DOC_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export type DocumentAsset = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

export async function listCustomerDocuments(
  client: AxiosInstance,
  customerId: number,
): Promise<CustomerDocument[]> {
  const { data } = await client.get<{ data: CustomerDocument[] }>(
    `/app/agents/customers/${customerId}/documents`,
  );
  return data.data ?? [];
}

/**
 * Uploads via fetch instead of axios. On React Native, axios mangles
 * multipart bodies (or rejects with "Network Error" before the request leaves
 * the device). The backend doc explicitly recommends fetch so RN sets the
 * boundary itself.
 */
export async function uploadCustomerDocument(
  environment: Environment,
  customerId: number,
  asset: DocumentAsset,
  type: string,
  additional?: Record<string, string>,
): Promise<CustomerDocument> {
  const token = await readString('accessToken');
  if (!token) {
    throw new Error('Not signed in.');
  }
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType,
  } as unknown as Blob);
  form.append('type', type);
  if (additional) {
    for (const [key, value] of Object.entries(additional)) {
      form.append(`additional_json[${key}]`, value);
    }
  }
  const response = await fetch(
    apiUrl(environment, `/app/agents/customers/${customerId}/documents`),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: form,
    },
  );
  const text = await response.text();
  const parsed = text ? safeJson(text) : null;
  if (!response.ok) {
    throw new UploadError(response.status, parsed);
  }
  return (parsed as { data: CustomerDocument }).data;
}

class UploadError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(extractFetchError(status, body));
    this.status = status;
    this.body = body;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractFetchError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    const fieldErr = b.errors ? Object.values(b.errors).flat()[0] : undefined;
    if (fieldErr) return fieldErr;
    if (b.message) return b.message;
  }
  return `Upload failed (${status}).`;
}

export async function deleteCustomerDocument(
  client: AxiosInstance,
  documentId: number,
): Promise<void> {
  await client.delete(`/app/agents/customers/documents/${documentId}`);
}

export async function updateCustomerDocument(
  client: AxiosInstance,
  documentId: number,
  additionalJson: Record<string, string>,
): Promise<CustomerDocument> {
  const { data } = await client.patch<{ data: CustomerDocument }>(
    `/app/agents/customers/documents/${documentId}`,
    { additional_json: additionalJson },
  );
  return data.data;
}

/**
 * Streams the document to the device cache and returns the local file URI.
 * The server enforces auth scope, so we pass the bearer token via headers.
 * Caller is responsible for sharing/opening the resulting URI.
 */
export async function downloadCustomerDocument(
  environment: Environment,
  doc: CustomerDocument,
): Promise<string> {
  const token = await readString('accessToken');
  if (!token) {
    throw new Error('Not signed in.');
  }
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Filesystem cache unavailable on this device.');
  }
  const destination = `${cacheDir}doc-${doc.id}-${sanitizeFilename(
    doc.original_name,
  )}`;
  const result = await FileSystem.downloadAsync(
    apiUrl(environment, `/app/agents/customers/documents/${doc.id}/download`),
    destination,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*',
      },
    },
  );
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Download failed (${result.status}).`);
  }
  return result.uri;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'document';
}
