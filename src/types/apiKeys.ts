export type ApiKeyScope = "models:read" | "models:write"

export type ApiKey = {
  id: string
  name: string
  tokenPrefix: string
  scopes: ApiKeyScope[]
  modelIds: string[] | null
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type CreateApiKeyRequest = {
  name: string
  scopes: ApiKeyScope[]
  modelIds?: string[] | null
  expiresAt?: string | null
}

export type CreateApiKeyResponse = {
  key: string
  apiKey: ApiKey
}

export type UpdateApiKeyRequest = {
  name?: string
  scopes?: ApiKeyScope[]
  modelIds?: string[] | null
  clearModelIds?: boolean
}
