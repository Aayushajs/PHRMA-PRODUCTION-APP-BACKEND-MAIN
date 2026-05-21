/*
┌───────────────────────────────────────────────────────────────────────┐
│  Elasticsearch Config - Lightweight HTTP client wrapper.              │
│  Supports search/indexing without adding a new SDK dependency.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || "http://localhost:9200";
const ELASTICSEARCH_USERNAME = process.env.ELASTICSEARCH_USERNAME || "";
const ELASTICSEARCH_PASSWORD = process.env.ELASTICSEARCH_PASSWORD || "";
const ELASTICSEARCH_ENABLED = process.env.ELASTICSEARCH_ENABLED === "true";
let ELASTICSEARCH_AVAILABLE = ELASTICSEARCH_ENABLED;

const authHeader =
  ELASTICSEARCH_USERNAME || ELASTICSEARCH_PASSWORD
    ? {
        auth: {
          username: ELASTICSEARCH_USERNAME,
          password: ELASTICSEARCH_PASSWORD,
        },
      }
    : {};

const elasticClient: AxiosInstance = axios.create({
  baseURL: ELASTICSEARCH_URL,
  timeout: 5000,
  ...authHeader,
});

export const isElasticsearchAvailable = (): boolean => ELASTICSEARCH_AVAILABLE;

const disableElasticsearch = (reason?: unknown) => {
  ELASTICSEARCH_AVAILABLE = false;
  if (reason) {
    console.warn("[elasticsearch] Disabled at runtime:", reason);
  }
};

export const isRuntimeElasticsearchAvailable = (): boolean => ELASTICSEARCH_AVAILABLE;

export const ensureElasticIndex = async (indexName: string, mapping: Record<string, any>) => {
  if (!isRuntimeElasticsearchAvailable()) return;

  try {
    const exists = await elasticClient.head(`/${indexName}`);
    if (exists.status === 200) return;
  } catch {
    // continue to create
  }

  try {
    await elasticClient.put(`/${indexName}`, mapping);
  } catch (error) {
    const axiosError = error as { code?: string; message?: string };
    if (axiosError.code === "ECONNREFUSED") {
      disableElasticsearch(`connection refused while creating ${indexName}`);
      return;
    }

    console.warn(`[elasticsearch] Failed to create index ${indexName}:`, error);
  }
};

export const indexDocument = async (indexName: string, documentId: string, body: Record<string, any>) => {
  if (!isRuntimeElasticsearchAvailable()) return;
  try {
    await elasticClient.put(`/${indexName}/_doc/${documentId}`, body);
  } catch (error) {
    const axiosError = error as { code?: string; message?: string };
    if (axiosError.code === "ECONNREFUSED") {
      disableElasticsearch(`connection refused while indexing ${indexName}`);
      return;
    }

    console.warn(`[elasticsearch] Failed to index document in ${indexName}:`, error);
  }
};

export const bulkIndexDocuments = async (indexName: string, documents: Array<{ id: string; body: Record<string, any> }>) => {
  if (!isRuntimeElasticsearchAvailable() || documents.length === 0) return;

  const lines: string[] = [];
  for (const document of documents) {
    lines.push(JSON.stringify({ index: { _index: indexName, _id: document.id } }));
    lines.push(JSON.stringify(document.body));
  }

  try {
    await elasticClient.post(`/_bulk`, `${lines.join("\n")}\n`, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (error) {
    const axiosError = error as { code?: string; message?: string };
    if (axiosError.code === "ECONNREFUSED") {
      disableElasticsearch(`connection refused during bulk indexing ${indexName}`);
      return;
    }

    console.warn(`[elasticsearch] Bulk index failed for ${indexName}:`, error);
  }
};

export const searchElastic = async (indexName: string, body: Record<string, any>) => {
  if (!isRuntimeElasticsearchAvailable()) {
    return { hits: { hits: [] } };
  }

  try {
    const response = await elasticClient.post(`/${indexName}/_search`, body);
    return response.data;
  } catch (error) {
    const axiosError = error as { code?: string; message?: string };
    if (axiosError.code === "ECONNREFUSED") {
      disableElasticsearch(`connection refused while searching ${indexName}`);
      return { hits: { hits: [] } };
    }

    console.warn(`[elasticsearch] Search failed for ${indexName}:`, error);
    return { hits: { hits: [] } };
  }
};

export default elasticClient;
