export type CustomPropertyType = "string" | "number" | "boolean" | "enum";

export type CustomProperty = {
  id: string;
  name: string;
  type: CustomPropertyType;
  required: boolean;
  regex?: string;
  min: number | null;
  max: number | null;
  enumValues?: string[];
};

export type NodeStyle = {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
};

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const createId = () => {
  const cryptoApi =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
};

const normalizeCustomProperties = (value: unknown): CustomProperty[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = isRecord(item) ? item : {};
    const type =
      record.type === "number" ||
      record.type === "boolean" ||
      record.type === "enum"
        ? record.type
        : "string";
    return {
      id: typeof record.id === "string" ? record.id : createId(),
      name: typeof record.name === "string" ? record.name : "",
      type,
      required: Boolean(record.required),
      regex: typeof record.regex === "string" ? record.regex : undefined,
      min: typeof record.min === "number" ? record.min : null,
      max: typeof record.max === "number" ? record.max : null,
      enumValues: Array.isArray(record.enumValues)
        ? record.enumValues.filter((val) => typeof val === "string")
        : undefined
    };
  });
};

const normalizeStyle = (value: unknown): NodeStyle | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const style: NodeStyle = {};
  if (typeof value.fillColor === "string") {
    style.fillColor = value.fillColor;
  }
  if (typeof value.strokeColor === "string") {
    style.strokeColor = value.strokeColor;
  }
  if (typeof value.strokeWidth === "number") {
    style.strokeWidth = value.strokeWidth;
  }
  if (typeof value.cornerRadius === "number") {
    style.cornerRadius = value.cornerRadius;
  }
  return Object.keys(style).length ? style : undefined;
};

// Types for parsed attrs
export type EntityAttrs = {
  tags: string[];
  customProperties: CustomProperty[];
};

export type TypeAttrs = {
  style?: NodeStyle;
  width?: number;
  height?: number;
  cornerRadius?: number;
};

// Parse entity attrs (for components/relations)
export const parseEntityAttrs = (attrs: string | null): EntityAttrs => {
  if (!attrs) {
    return { tags: [], customProperties: [] };
  }

  try {
    const parsed = JSON.parse(attrs) as unknown;
    const record = isRecord(parsed) ? parsed : {};

    return {
      tags: normalizeTags(record.tags),
      customProperties: normalizeCustomProperties(record.customProperties)
    };
  } catch {
    return { tags: [], customProperties: [] };
  }
};

// Serialize entity attrs (for components/relations)
export const serializeEntityAttrs = (attrs: EntityAttrs): string => {
  return JSON.stringify({
    tags: attrs.tags,
    customProperties: attrs.customProperties
  });
};

// Parse type attrs (for node-types/link-types)
export const parseTypeAttrs = (attrs: string | null): TypeAttrs => {
  if (!attrs) {
    return {};
  }

  try {
    const parsed = JSON.parse(attrs) as unknown;
    const record = isRecord(parsed) ? parsed : {};

    const result: TypeAttrs = {};

    const style = normalizeStyle(record.style);
    if (style) {
      result.style = style;
    }

    if (typeof record.width === "number") {
      result.width = record.width;
    }
    if (typeof record.height === "number") {
      result.height = record.height;
    }
    if (typeof record.cornerRadius === "number") {
      result.cornerRadius = record.cornerRadius;
    }

    return result;
  } catch {
    return {};
  }
};

// Serialize type attrs (for node-types/link-types)
export const serializeTypeAttrs = (attrs: TypeAttrs): string => {
  const result: Record<string, unknown> = {};

  if (attrs.style) {
    result.style = attrs.style;
  }
  if (typeof attrs.width === "number") {
    result.width = attrs.width;
  }
  if (typeof attrs.height === "number") {
    result.height = attrs.height;
  }
  if (typeof attrs.cornerRadius === "number") {
    result.cornerRadius = attrs.cornerRadius;
  }

  return JSON.stringify(result);
};
