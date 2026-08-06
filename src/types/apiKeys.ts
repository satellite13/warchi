export type ApiKeyScope = 'models:read' | 'models:write'
export type ApiKeyMode = 'all' | 'grants'

export type ApiKeyGrant = {
  modelId: string
  scopes: ApiKeyScope[]
}

export type ApiKey = {
  id: string
  name: string
  tokenPrefix: string
  mode: ApiKeyMode
  scopes: ApiKeyScope[] | null
  grants: ApiKeyGrant[] | null
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type CreateApiKeyRequest = {
  name: string
  mode: ApiKeyMode
  scopes?: ApiKeyScope[] | null
  grants?: ApiKeyGrant[] | null
  expiresAt?: string | null
}

export type CreateApiKeyResponse = {
  key: string
  apiKey: ApiKey
}

export type UpdateApiKeyRequest = {
  name?: string
  expiresAt?: string | null
  clearExpiresAt?: boolean
}
